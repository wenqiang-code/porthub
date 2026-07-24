/**
 * 注册器 —— 把任意项目(包括非本系统创建的老项目)纳管到端口池。
 *
 * 层级模型: 项目(根目录) → 子项目(模块,各自可有端口)。
 *
 * 核心规则(register):
 *  1. 传了 port → 端口裁决: 合规则原样登记; 冲突/不合规则自动分配新端口,
 *     changed = true 并给出 reason,调用方(Kimi)必须把项目配置改成新端口
 *  2. 不传 port → 视为根项目/纯目录登记,不占用端口(如 Kimi 的工作区根目录)
 *  3. 项目已登记过 → 视为“重新申报”: 端口一致则不动,不一致则重新裁决
 */
const crypto = require('crypto');
const store = require('./store');
const allocator = require('./allocator');
const { resolveParent, validateParent } = require('./parents');

/**
 * 裁决端口: 判断期望端口是否可用,不可用则分配新端口。
 * @returns {{ port:number, changed:boolean, reason?:string } | { error:string }}
 */
function resolvePort(db, name, desiredPort, category) {
  const reserved = db.settings.reservedPorts || [];
  const segments = db.settings.segments || [];
  const holder = db.projects.find(p => p.port === desiredPort && p.name !== name);
  const inSegment = segments.some(s => desiredPort >= s.start && desiredPort <= s.end);

  let reason = null;
  if (reserved.includes(desiredPort)) {
    reason = `端口 ${desiredPort} 是保留端口`;
  } else if (holder) {
    reason = `端口 ${desiredPort} 已分配给项目 "${holder.name}"`;
  } else if (!inSegment) {
    reason = `端口 ${desiredPort} 不在任何端口分段内`;
  }

  if (!reason) return { port: desiredPort, changed: false };

  const newPort = allocator.allocate(db, category || 'tool');
  if (newPort == null) return { error: '端口池已满,无法调整,请先在设置中扩充分段' };
  return { port: newPort, changed: true, reason };
}

/**
 * 注册/纳管一个项目。
 * @param {object} input { name, port?, category?, path?, description?, parent? }
 *   port 省略表示登记为不占端口的根项目/目录; parent 可传父项目 id/名称/路径
 * @returns {Promise<object>} { project, changed, reason?, previousPort?, hostOccupied, isNew }
 */
async function register(input) {
  const { name, port, category, path: projPath, description, parent } = input || {};
  if (!name || !String(name).trim()) return { error: 'name 为必填项', status: 400 };

  const hasPort = port !== undefined && port !== null && port !== '';
  let desiredPort = null;
  if (hasPort) {
    desiredPort = Number(port);
    if (!Number.isInteger(desiredPort) || desiredPort < 1 || desiredPort > 65535) {
      return { error: 'port 必须是 1-65535 的整数', status: 400 };
    }
  }

  const db = store.getDb();
  const existing = db.projects.find(p => p.name === String(name).trim());
  const finalCategory = category || (existing && existing.category) || 'tool';

  let verdict = { port: null, changed: false };
  if (hasPort) {
    verdict = resolvePort(db, String(name).trim(), desiredPort, finalCategory);
    if (verdict.error) return { error: verdict.error, status: 507 };
  }

  // 本机占用情况仅作提示(占用的很可能就是该项目自己)
  const hostOccupied = verdict.port ? !(await allocator.isPortFreeOnHost(verdict.port)) : false;

  const result = store.update(db2 => {
    const now = new Date().toISOString();
    const proj = db2.projects.find(p => p.name === String(name).trim());
    const parentId = parent !== undefined ? resolveParent(db2, parent, projPath).parentId : undefined;
    if (parentId !== undefined) {
      const check = validateParent(db2, proj ? proj.id : null, parentId);
      if (!check.ok) return { error: check.error, status: 400 };
    }
    if (proj) {
      const previousPort = proj.port;
      if (hasPort) proj.port = verdict.port;
      proj.category = finalCategory;
      if (projPath !== undefined) proj.path = projPath;
      if (description !== undefined) proj.description = description;
      if (parentId !== undefined) proj.parentId = parentId;
      proj.updatedAt = now;
      return { project: proj, previousPort, isNew: false };
    }
    const newProj = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      category: finalCategory,
      description: description || '',
      path: projPath || '',
      parentId: parentId || '',
      port: verdict.port,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    db2.projects.push(newProj);
    return { project: newProj, previousPort: null, isNew: true };
  });

  if (result.error) return result;

  return {
    ...result,
    changed: verdict.changed,
    reason: verdict.reason || null,
    hostOccupied
  };
}

module.exports = { register, resolvePort };

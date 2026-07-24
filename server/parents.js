/**
 * 父项目解析助手 —— 层级模型: 项目(根目录) → 子项目(模块)。
 *
 * 项目的 parentId 指向另一个项目(根项目)。
 * 根项目(parentId 为空)代表 Kimi 工作的项目根目录,可以不占用端口。
 * 子项目是该目录下的模块(前端/后端/微服务),各自可以申请自己的端口。
 *
 * API/CLI 传入的 parent 可以是: 父项目 id / 名称 / 路径。
 * 传入不存在的名称时自动创建为根项目(不占端口),方便 CLI 使用。
 */
const crypto = require('crypto');

/**
 * @param db 数据库对象(自动创建父项目时需在 store.update 可写上下文中调用)
 * @param input 父项目 id / 名称 / 路径 / 空
 * @param parentPath 可选: 自动创建父项目时记录的路径
 * @returns {{ parentId: string, created?: object }}
 */
function resolveParent(db, input, parentPath) {
  if (input === undefined || input === null || String(input).trim() === '') {
    return { parentId: '' };
  }
  const key = String(input).trim();
  const p = db.projects.find(x => x.id === key || x.name === key || (x.path && x.path === key));
  if (p) return { parentId: p.id };
  const now = new Date().toISOString();
  const np = {
    id: crypto.randomUUID(),
    name: key,
    category: 'tool',
    description: '',
    path: parentPath || '',
    parentId: '',
    port: null, // 根项目默认不占端口
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
  db.projects.push(np);
  return { parentId: np.id, created: np };
}

/** 校验 parentId 合法性: 父项目必须存在,且不能形成环(自己或后代不能当爹) */
function validateParent(db, projectId, parentId) {
  if (!parentId) return { ok: true };
  const parent = db.projects.find(x => x.id === parentId);
  if (!parent) return { ok: false, error: '父项目不存在' };
  let cur = parent;
  const seen = new Set();
  while (cur && cur.parentId) {
    if (cur.parentId === projectId || seen.has(cur.id)) {
      return { ok: false, error: '不能把项目挂到它自己或它的子项目下面' };
    }
    seen.add(cur.id);
    cur = db.projects.find(x => x.id === cur.parentId);
  }
  return { ok: true };
}

/** 收集项目的所有后代 id(用于级联删除) */
function collectDescendants(db, id) {
  const result = [];
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    const children = db.projects.filter(p => p.parentId === cur);
    children.forEach(c => {
      result.push(c.id);
      queue.push(c.id);
    });
  }
  return result;
}

module.exports = { resolveParent, validateParent, collectDescendants };

const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const allocator = require('../allocator');
const registrar = require('../registrar');
const scanner = require('../scanner');
const { resolveParent, validateParent, collectDescendants } = require('../parents');

const router = express.Router();

const VALID_STATUS = ['active', 'stopped', 'archived'];

/** 给项目列表附加 parentName,方便前端展示 */
function withParentName(db, list) {
  return list.map(p => {
    const parent = p.parentId ? db.projects.find(x => x.id === p.parentId) : null;
    return { ...p, parentName: parent ? parent.name : '' };
  });
}

/** GET /api/projects — 项目列表(可按 parent/category/status/keyword 过滤) */
router.get('/', (req, res) => {
  const { category, status, keyword, parent } = req.query;
  const db = store.getDb();
  let list = db.projects;
  if (parent === 'none') list = list.filter(p => !p.parentId);
  else if (parent) list = list.filter(p => p.parentId === parent);
  if (category) list = list.filter(p => p.category === category);
  if (status) list = list.filter(p => p.status === status);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      (p.description || '').toLowerCase().includes(kw) ||
      (p.path || '').toLowerCase().includes(kw) ||
      String(p.port || '').includes(kw)
    );
  }
  res.json(withParentName(db, list));
});

/** GET /api/projects/:id */
router.get('/:id', (req, res) => {
  const db = store.getDb();
  const p = db.projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const children = db.projects.filter(x => x.parentId === p.id);
  res.json({ ...withParentName(db, [p])[0], children });
});

/**
 * POST /api/projects — 创建项目。
 * body: { name, category?, description?, path?, port?, parent?, noPort? }
 *  - 不传 port 且未指定 noPort: 按策略自动分配端口
 *  - noPort=true: 不分配端口(用于纯目录根项目)
 *  - 传 port: 申请指定端口,冲突返回 409
 *  - parent: 父项目 id/名称/路径(不存在的名称自动创建为根项目)
 */
router.post('/', async (req, res) => {
  const { name, category, description, path: projPath, port, parent, noPort } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name 为必填项' });
  }
  const db = store.getDb();
  if (db.projects.some(p => p.name === name.trim())) {
    return res.status(409).json({ error: `项目名 "${name}" 已存在` });
  }

  let assignedPort = null;
  if (noPort) {
    assignedPort = null;
  } else if (port != null) {
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      return res.status(400).json({ error: 'port 必须是 1-65535 的整数' });
    }
    if ((db.settings.reservedPorts || []).includes(p)) {
      return res.status(409).json({ error: `端口 ${p} 是保留端口,不可申请` });
    }
    if (db.projects.some(x => x.port === p)) {
      return res.status(409).json({ error: `端口 ${p} 已被占用` });
    }
    assignedPort = p;
  } else {
    assignedPort = allocator.allocate(db, category || 'tool');
    if (assignedPort == null) {
      return res.status(507).json({ error: '端口池已满,无法分配新端口,请调整分段配置' });
    }
  }

  const project = store.update(db2 => {
    const parentId = resolveParent(db2, parent, projPath).parentId;
    const check = validateParent(db2, null, parentId);
    if (!check.ok) return { error: check.error };
    const proj = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: category || 'tool',
      description: description || '',
      path: projPath || '',
      parentId,
      port: assignedPort,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db2.projects.push(proj);
    return proj;
  });
  if (project.error) return res.status(400).json({ error: project.error });
  res.status(201).json(project);
});

/**
 * POST /api/projects/register — 注册/纳管项目(Kimi 运行或操作项目前必须调用)。
 * body: { name, port?, category?, path?, description?, parent? }
 *  - 传 port: 端口合规则原样登记(changed=false); 冲突/不合规则自动分配新端口
 *    (changed=true, reason 说明原因),调用方必须把项目配置改为返回的 port
 *  - 不传 port: 登记为不占端口的根项目/目录
 *  - parent: 挂载到父项目下(Kimi 工作区根目录对应的项目)
 */
router.post('/register', async (req, res) => {
  const result = await registrar.register(req.body || {});
  if (result.error) return res.status(result.status || 500).json({ error: result.error });
  res.status(result.isNew ? 201 : 200).json(result);
});

/**
 * POST /api/projects/scan — 扫描磁盘目录,发现已有项目。
 * body: { root, depth?, register?, parent? }
 *  - register=false(默认): 只报告,标注每个项目的登记状态
 *  - register=true: 把未登记的项目全部注册(冲突端口自动调整)
 *  - 若 root 本身含 package.json,自动把它作为根项目,扫描到的模块挂为其子项目
 */
router.post('/scan', async (req, res) => {
  const { root, depth, register, parent } = req.body || {};
  if (!root) return res.status(400).json({ error: 'root 为必填项' });
  const db = store.getDb();
  const found = scanner.scan(root, Number(depth) || 1, db.settings.segments || []);

  // 探测 root 自身是否是项目(含 package.json),是则扫描结果应挂到它下面
  const path = require('path');
  const fs = require('fs');
  let rootAsProject = null;
  const rootPkg = path.join(root, 'package.json');
  if (fs.existsSync(rootPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkg, 'utf-8'));
      rootAsProject = { name: pkg.name || path.basename(root), path: path.resolve(root) };
    } catch { /* 忽略损坏的 package.json */ }
  }

  const report = [];
  for (const item of found) {
    const existing = db.projects.find(p => p.name === item.name || (item.path && p.path === item.path));
    if (existing) {
      const portMatch = item.detectedPort == null || item.detectedPort === existing.port;
      report.push({ ...item, status: 'registered', portMatch, registeredPort: existing.port });
      continue;
    }
    if (!register) {
      if (item.detectedPort == null) {
        report.push({ ...item, status: 'unregistered', note: '未探测到端口,注册时将自动分配' });
      } else {
        const verdict = registrar.resolvePort(db, item.name, item.detectedPort, item.category);
        report.push({
          ...item,
          status: verdict.changed ? 'conflict' : 'unregistered',
          note: verdict.changed ? verdict.reason : '端口合规,可直接注册'
        });
      }
      continue;
    }
    // 执行注册: 未探测到端口时先按策略自动分配一个
    const desired = item.detectedPort != null
      ? item.detectedPort
      : allocator.allocate(store.getDb(), item.category || 'tool');
    if (desired == null) {
      report.push({ ...item, status: 'error', note: '端口池已满' });
      continue;
    }
    const r = await registrar.register({
      name: item.name,
      port: desired,
      category: item.category,
      path: item.path,
      parent: parent || (rootAsProject && item.path !== rootAsProject.path ? rootAsProject.name : undefined)
    });
    if (r.error) {
      report.push({ ...item, status: 'error', note: r.error });
    } else {
      report.push({
        ...item,
        status: r.changed ? 'adjusted' : 'imported',
        registeredPort: r.project.port,
        note: r.changed ? `${r.reason},已改为 ${r.project.port}` : '注册成功'
      });
    }
  }

  // 注册 root 自身为根项目(不占端口),让模块有父级可挂
  let rootProject = null;
  if (register && rootAsProject && found.some(i => i.status === 'imported' || i.status === 'adjusted')) {
    const r = await registrar.register({ name: rootAsProject.name, path: rootAsProject.path });
    if (!r.error) rootProject = r.project;
  }

  res.json({ rootProject, items: report });
});

/**
 * POST /api/projects/batch — 批量操作。
 * body: { ids: [...], action: 'delete'|'setParent'|'setStatus'|'setCategory', value? }
 *  - delete     : 批量删除(含各自子项目)并回收端口,返回 releasedPorts
 *  - setParent  : value 为父项目 id/名称(不存在自动创建为根项目),空串表示提升为根项目
 *  - setStatus  : value 为 active/stopped/archived
 *  - setCategory: value 为类别标识(不改端口;如需换段请逐个 reallocate)
 */
router.post('/batch', (req, res) => {
  const { ids, action, value } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids 必须是非空数组' });
  }
  if (!['delete', 'setParent', 'setStatus', 'setCategory'].includes(action)) {
    return res.status(400).json({ error: 'action 必须是 delete / setParent / setStatus / setCategory' });
  }
  if (action === 'setStatus' && !VALID_STATUS.includes(value)) {
    return res.status(400).json({ error: `status 必须是 ${VALID_STATUS.join(' / ')}` });
  }
  const result = store.update(db => {
    if (action === 'delete') {
      const allIds = new Set();
      ids.forEach(id => {
        if (db.projects.some(p => p.id === id)) {
          allIds.add(id);
          collectDescendants(db, id).forEach(d => allIds.add(d));
        }
      });
      const releasedPorts = db.projects.filter(p => allIds.has(p.id) && p.port).map(p => p.port);
      db.projects = db.projects.filter(p => !allIds.has(p.id));
      return { affected: allIds.size, releasedPorts };
    }
    const targets = db.projects.filter(p => ids.includes(p.id));
    if (targets.length === 0) return { affected: 0 };
    let parentId;
    if (action === 'setParent') {
      parentId = resolveParent(db, value).parentId;
      for (const t of targets) {
        const check = validateParent(db, t.id, parentId);
        if (!check.ok) return { error: `"${t.name}": ${check.error}` };
      }
    }
    const now = new Date().toISOString();
    targets.forEach(p => {
      if (action === 'setParent') p.parentId = parentId;
      if (action === 'setStatus') p.status = value;
      if (action === 'setCategory') p.category = value;
      p.updatedAt = now;
    });
    return { affected: targets.length };
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, ...result });
});

/** PUT /api/projects/:id — 更新项目信息(不允许改端口,换端口走 /reallocate) */
router.put('/:id', (req, res) => {
  const { name, category, description, path: projPath, status, parent } = req.body || {};
  const updated = store.update(db => {
    const p = db.projects.find(x => x.id === req.params.id);
    if (!p) return null;
    if (name !== undefined) p.name = String(name).trim();
    if (category !== undefined) p.category = category;
    if (description !== undefined) p.description = description;
    if (projPath !== undefined) p.path = projPath;
    if (parent !== undefined) {
      const parentId = resolveParent(db, parent, projPath).parentId;
      const check = validateParent(db, p.id, parentId);
      if (!check.ok) return { error: check.error };
      p.parentId = parentId;
    }
    if (status !== undefined && VALID_STATUS.includes(status)) p.status = status;
    p.updatedAt = new Date().toISOString();
    return p;
  });
  if (!updated) return res.status(404).json({ error: '项目不存在' });
  if (updated.error) return res.status(400).json({ error: updated.error });
  res.json(updated);
});

/** POST /api/projects/:id/reallocate — 释放旧端口,按当前类别重新分配 */
router.post('/:id/reallocate', (req, res) => {
  const result = store.update(db => {
    const p = db.projects.find(x => x.id === req.params.id);
    if (!p) return null;
    if (!p.port) return { error: '该项目没有占用端口,无需重新分配' };
    const oldPort = p.port;
    const used = new Set(db.projects.filter(x => x.id !== p.id && x.port).map(x => x.port));
    const ctx = {
      usedPorts: used,
      reservedPorts: new Set(db.settings.reservedPorts || []),
      segments: db.settings.segments || [],
      category: p.category
    };
    const strategy = allocator.STRATEGIES[db.settings.strategy] || allocator.STRATEGIES.segmented;
    const newPort = strategy(ctx);
    if (newPort == null) return { error: '端口池已满' };
    allocator.release(db, oldPort);
    p.port = newPort;
    p.updatedAt = new Date().toISOString();
    return { project: p, oldPort };
  });
  if (!result) return res.status(404).json({ error: '项目不存在' });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

/** DELETE /api/projects/:id — 删除项目(级联删除其子项目)并释放所有端口 */
router.delete('/:id', (req, res) => {
  const removed = store.update(db => {
    const target = db.projects.find(x => x.id === req.params.id);
    if (!target) return null;
    const ids = new Set([target.id, ...collectDescendants(db, target.id)]);
    const removedProjects = db.projects.filter(p => ids.has(p.id));
    db.projects = db.projects.filter(p => !ids.has(p.id));
    removedProjects.forEach(p => p.port && allocator.release(db, p.port));
    return { target, removedCount: removedProjects.length, releasedPorts: removedProjects.filter(p => p.port).map(p => p.port) };
  });
  if (!removed) return res.status(404).json({ error: '项目不存在' });
  res.json({ ok: true, removedCount: removed.removedCount, releasedPorts: removed.releasedPorts, releasedPort: removed.target.port });
});

module.exports = router;

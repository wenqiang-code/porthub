const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const { SERVICE_TYPES, allocateResources, toEnv } = require('../services');
const { servicePatch } = require('../service-validation');

function createServicesRouter(store) {
  const router = express.Router();

  function customTypes(db) {
    return (db.serviceTypes || []).map(t => ({
      value: t.value, label: t.label, fields: [], resources: [], custom: true
    }));
  }

  function hasType(db, value) {
    return Object.hasOwn(SERVICE_TYPES, value) || (db.serviceTypes || []).some(t => t.value === value);
  }

  /** GET /api/services/types — 服务类型注册表(前端动态表单用) */
  router.get('/types', (req, res) => {
    const db = store.getDb();
    res.json([
      ...Object.entries(SERVICE_TYPES).map(([value, t]) => ({
        value,
        label: t.label,
        fields: t.fields,
        resources: Object.entries(t.resources || {}).map(([k, r]) => ({ key: k, label: r.label })),
        custom: false
      })),
      ...customTypes(db)
    ]);
  });

  /** POST /api/services/types — 新增用户服务类型 */
  router.post('/types', (req, res) => {
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: '类型名称不能为空' });
    const normalized = label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!normalized) return res.status(400).json({ error: '类型名称必须包含中文或字母数字' });
    const db = store.getDb();
    if (Object.values(SERVICE_TYPES).some(t => t.label === label) || (db.serviceTypes || []).some(t => t.label === label)) {
      return res.status(409).json({ error: `类型「${label}」已存在` });
    }
    let value = `custom_${normalized}`;
    let suffix = 2;
    while (hasType(db, value)) value = `custom_${normalized}_${suffix++}`;
    const type = store.update(current => {
      const item = { value, label };
      current.serviceTypes.push(item);
      return item;
    });
    res.status(201).json({ ...type, fields: [], resources: [], custom: true });
  });

  /** DELETE /api/services/types/:value — 删除未使用的用户服务类型 */
  router.delete('/types/:value', (req, res) => {
    if (Object.hasOwn(SERVICE_TYPES, req.params.value)) return res.status(400).json({ error: '内置服务类型不可删除' });
    const result = store.update(db => {
      const idx = (db.serviceTypes || []).findIndex(t => t.value === req.params.value);
      if (idx < 0) return null;
      if (db.services.some(s => s.type === req.params.value)) return { used: true };
      return { type: db.serviceTypes.splice(idx, 1)[0] };
    });
    if (!result) return res.status(404).json({ error: '服务类型不存在' });
    if (result.used) return res.status(409).json({ error: '该类型已有服务在使用，不能删除' });
    res.json({ ok: true, type: result.type });
  });

  /** GET /api/services — 服务列表(含分配数) */
  router.get('/', (req, res) => {
    const db = store.getDb();
    const labels = new Map(customTypes(db).map(t => [t.value, t.label]));
    res.json(db.services.map(s => ({
      enabled: true,
      ...s,
      typeLabel: (SERVICE_TYPES[s.type] || {}).label || labels.get(s.type) || s.type,
      allocCount: db.allocations.filter(a => a.serviceId === s.id).length
    })));
  });

  /** POST /api/services — 新增服务 { type, name, config, enabled? } */
  router.post('/', (req, res) => {
    const { type, name } = req.body || {};
    if (!hasType(store.getDb(), type)) return res.status(400).json({ error: `不支持的服务类型 "${type}"` });
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name 为必填项' });
    let patch;
    try { patch = servicePatch(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (store.getDb().services.some(s => s.name === String(name).trim())) {
      return res.status(409).json({ error: `服务 "${name}" 已存在` });
    }
    const svc = store.update(db => {
      const s = {
        id: crypto.randomUUID(),
        type,
        name: String(name).trim(),
        config: {},
        configMeta: {},
        icon: null,
        enabled: true,
        ...patch,
        createdAt: new Date().toISOString()
      };
      db.services.push(s);
      return s;
    });
    res.status(201).json(svc);
  });

  /** PUT /api/services/:id */
  router.put('/:id', (req, res) => {
    const existing = store.getDb().services.find(x => x.id === req.params.id);
    if (!existing) return res.status(404).json({ error: '服务不存在' });
    let patch;
    try { patch = servicePatch(req.body || {}, existing); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (patch.name !== undefined && store.getDb().services.some(x => x.name === patch.name && x.id !== existing.id)) {
      return res.status(409).json({ error: `服务名 "${patch.name}" 已被占用` });
    }
    const updated = store.update(db => {
      const s = db.services.find(x => x.id === req.params.id);
      Object.assign(s, patch);
      return s;
    });
    res.json(updated);
  });

  /** DELETE /api/services/:id — 删除服务并释放其全部分配记录 */
  router.delete('/:id', (req, res) => {
    const result = store.update(db => {
      const idx = db.services.findIndex(x => x.id === req.params.id);
      if (idx === -1) return null;
      const [s] = db.services.splice(idx, 1);
      const before = db.allocations.length;
      db.allocations = db.allocations.filter(a => a.serviceId !== s.id);
      return { released: before - db.allocations.length };
    });
    if (!result) return res.status(404).json({ error: '服务不存在' });
    res.json({ ok: true, releasedAllocations: result.released });
  });

  /** GET /api/services/:id/allocations — 某服务的分配记录 */
  router.get('/:id/allocations', (req, res) => {
    const db = store.getDb();
    const svc = db.services.find(x => x.id === req.params.id);
    if (!svc) return res.status(404).json({ error: '服务不存在' });
    const type = SERVICE_TYPES[svc.type] || {};
    res.json(
      db.allocations
        .filter(a => a.serviceId === svc.id)
        .map(a => ({ ...a, resourceLabel: ((type.resources || {})[a.resource] || {}).label || a.resource }))
    );
  });

  /** DELETE /api/services/allocations/:allocId — 释放单条分配(项目下次获取时重新分配) */
  router.delete('/allocations/:allocId', (req, res) => {
    const removed = store.update(db => {
      const idx = db.allocations.findIndex(a => a.id === req.params.allocId);
      if (idx === -1) return null;
      return db.allocations.splice(idx, 1)[0];
    });
    if (!removed) return res.status(404).json({ error: '分配记录不存在' });
    res.json({ ok: true, released: removed });
  });

  /**
   * POST /api/services/provision — 为项目获取全部(或指定)服务配置。
   * body: { projectName, serviceIds? }
   * 动态资源幂等分配: 同一项目重复调用返回相同结果。
   * 返回: { project, services: {...}, env: {...} }
   */
  router.post('/provision', (req, res) => {
    const { projectName, serviceIds } = req.body || {};
    if (!projectName || !String(projectName).trim()) {
      return res.status(400).json({ error: 'projectName 为必填项' });
    }
    const name = String(projectName).trim();
    try {
      const bundle = store.update(db => {
        // 停用的服务不下发(除非被显式指定)
        const explicit = Array.isArray(serviceIds) && serviceIds.length;
        let svcs;
        if (explicit) {
          const selectors = new Set(serviceIds);
          svcs = db.services.filter(s =>
            selectors.has(s.id)
            || selectors.has(s.name)
            || (selectors.has(s.type) && s.enabled !== false)
          );
        } else {
          svcs = db.services.filter(s => s.enabled !== false);
        }
        const skipped = db.services.filter(s => s.enabled === false && !svcs.includes(s)).map(s => s.name);
        const services = {};
        const env = {};
        for (const svc of svcs) {
          const resources = allocateResources(db, svc, name);
          services[svc.type] = {
            id: svc.id,
            name: svc.name,
            config: svc.config,
            resources
          };
          Object.assign(env, toEnv(svc, resources));
        }
        return { project: name, services, env, skippedDisabled: skipped };
      });
      res.json(bundle);
    } catch (e) {
      res.status(507).json({ error: e.message });
    }
  });

  return router;
}

module.exports = createServicesRouter(store);
module.exports.createServicesRouter = createServicesRouter;

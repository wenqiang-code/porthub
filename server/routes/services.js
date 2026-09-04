const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const { SERVICE_TYPES, allocateResources, toEnv } = require('../services');
const { servicePatch } = require('../service-validation');

function createServicesRouter(store) {
  const router = express.Router();

  /** GET /api/services/types — 服务类型注册表(前端动态表单用) */
  router.get('/types', (req, res) => {
    res.json(
      Object.entries(SERVICE_TYPES).map(([value, t]) => ({
        value,
        label: t.label,
        fields: t.fields,
        resources: Object.entries(t.resources || {}).map(([k, r]) => ({ key: k, label: r.label }))
      }))
    );
  });

  /** GET /api/services — 服务列表(含分配数) */
  router.get('/', (req, res) => {
    const db = store.getDb();
    res.json(db.services.map(s => ({
      enabled: true,
      ...s,
      typeLabel: (SERVICE_TYPES[s.type] || {}).label || s.type,
      allocCount: db.allocations.filter(a => a.serviceId === s.id).length
    })));
  });

  /** POST /api/services — 新增服务 { type, name, config, enabled? } */
  router.post('/', (req, res) => {
    const { type, name } = req.body || {};
    if (!Object.hasOwn(SERVICE_TYPES, type)) return res.status(400).json({ error: `不支持的服务类型 "${type}"` });
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

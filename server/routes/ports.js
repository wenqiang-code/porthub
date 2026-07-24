const express = require('express');
const store = require('../store');
const allocator = require('../allocator');
const hostproc = require('../hostproc');

const router = express.Router();

function parsePort(param) {
  const port = Number(param);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

/** GET /api/ports/pool — 端口池总览(每个分段的使用情况) */
router.get('/pool', (req, res) => {
  res.json(allocator.poolOverview(store.getDb()));
});

/** GET /api/ports/check/:port — 检查端口:是否保留/被项目占用/本机实际空闲 */
router.get('/check/:port', async (req, res) => {
  const port = Number(req.params.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(400).json({ error: '非法端口' });
  }
  const db = store.getDb();
  const holder = db.projects.find(p => p.port === port);
  const hostFree = await allocator.isPortFreeOnHost(port);
  res.json({
    port,
    reserved: (db.settings.reservedPorts || []).includes(port),
    allocatedTo: holder ? { id: holder.id, name: holder.name } : null,
    hostFree
  });
});

/** GET /api/ports/owner/:port — 查询正在监听该端口的本机进程 */
router.get('/owner/:port', async (req, res) => {
  const port = parsePort(req.params.port);
  if (!port) return res.status(400).json({ error: '非法端口' });
  try {
    const owners = await hostproc.findPortOwners(port);
    res.json({ port, owners });
  } catch (e) {
    res.status(500).json({ error: `查询失败: ${e.message}` });
  }
});

/** POST /api/ports/kill/:port — 结束监听该端口的本机进程(停止占用) */
router.post('/kill/:port', async (req, res) => {
  const port = parsePort(req.params.port);
  if (!port) return res.status(400).json({ error: '非法端口' });
  const db = store.getDb();
  if ((db.settings.reservedPorts || []).includes(port)) {
    return res.status(400).json({ error: `端口 ${port} 是保留端口,禁止操作` });
  }
  try {
    const owners = await hostproc.findPortOwners(port);
    if (!owners.length) return res.json({ port, killed: [], message: '端口未被占用' });
    if (owners.some(o => o.pid === process.pid)) {
      return res.status(400).json({ error: '该端口由管理中心自身占用,禁止结束' });
    }
    const killed = [];
    for (const o of owners) {
      await hostproc.killPid(o.pid);
      killed.push(o);
    }
    res.json({ port, killed });
  } catch (e) {
    res.status(500).json({ error: `结束进程失败: ${e.message}` });
  }
});

/** GET /api/ports/next?category=web — 预览下一个将分配的端口(不占用) */
router.get('/next', (req, res) => {
  const db = store.getDb();
  const usedPorts = new Set(db.projects.filter(p => p.port).map(p => p.port));
  const ctx = {
    usedPorts,
    reservedPorts: new Set(db.settings.reservedPorts || []),
    segments: db.settings.segments || [],
    category: req.query.category || 'tool'
  };
  const strategy = allocator.STRATEGIES[db.settings.strategy] || allocator.STRATEGIES.segmented;
  const port = strategy(ctx);
  if (port == null) return res.status(507).json({ error: '端口池已满' });
  res.json({ port, category: ctx.category, strategy: db.settings.strategy });
});

module.exports = router;

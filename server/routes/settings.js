const express = require('express');
const store = require('../store');

const router = express.Router();

/** GET /api/settings */
router.get('/', (req, res) => {
  res.json(store.getDb().settings);
});

/**
 * PUT /api/settings — 更新配置。
 * body: { strategy?, reservedPorts?, segments? }
 * 注意: 修改 segments 时会校验不与已分配端口冲突。
 */
router.put('/', (req, res) => {
  const { strategy, reservedPorts, segments } = req.body || {};
  const db = store.getDb();

  if (strategy !== undefined && !['segmented', 'sequential', 'random'].includes(strategy)) {
    return res.status(400).json({ error: 'strategy 必须是 segmented / sequential / random' });
  }
  if (reservedPorts !== undefined) {
    if (!Array.isArray(reservedPorts) || reservedPorts.some(p => !Number.isInteger(p))) {
      return res.status(400).json({ error: 'reservedPorts 必须是整数数组' });
    }
    const conflict = db.projects.find(p => p.port && reservedPorts.includes(p.port));
    if (conflict) {
      return res.status(409).json({ error: `端口 ${conflict.port} 已分配给项目 "${conflict.name}",不能设为保留` });
    }
  }
  if (segments !== undefined) {
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'segments 不能为空' });
    }
    for (const s of segments) {
      if (!s.category || !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start > s.end) {
        return res.status(400).json({ error: '每个分段必须包含 category, 且 start <= end 均为整数' });
      }
    }
    // 分段之间不允许重叠
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start <= sorted[i - 1].end) {
        return res.status(400).json({ error: `分段重叠: ${sorted[i - 1].category} 与 ${sorted[i].category}` });
      }
    }
    // 已分配端口必须仍落在某个分段内(否则会造成孤儿端口)
    for (const p of db.projects) {
      if (p.port && !segments.some(s => p.port >= s.start && p.port <= s.end)) {
        return res.status(409).json({ error: `已分配端口 ${p.port}(${p.name})不在任何新分段内,请先调整该项目` });
      }
    }
  }

  const updated = store.update(db2 => {
    if (strategy !== undefined) db2.settings.strategy = strategy;
    if (reservedPorts !== undefined) db2.settings.reservedPorts = reservedPorts;
    if (segments !== undefined) db2.settings.segments = segments;
    return db2.settings;
  });
  res.json(updated);
});

module.exports = router;

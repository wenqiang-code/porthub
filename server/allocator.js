/**
 * 端口分配器 —— 可插拔策略模式。
 *
 * 内置三种策略,可在 settings.strategy 中切换:
 *  - segmented  : 按项目类别(web/api/service/tool)分段分配,段内取最小可用端口(默认,最合理)
 *  - sequential : 在整个端口池范围内顺序取最小可用端口
 *  - random     : 在适用范围内随机取一个可用端口
 *
 * 扩展方法: 在 STRATEGIES 中新增一个函数 (ctx) => number|null 即可,
 * ctx = { usedPorts:Set, reservedPorts:Set, segments:Array, category:String }
 */
const net = require('net');

const STRATEGIES = {
  /** 按类别分段分配 */
  segmented(ctx) {
    const seg = ctx.segments.find(s => s.category === ctx.category) || ctx.segments[ctx.segments.length - 1];
    for (let p = seg.start; p <= seg.end; p++) {
      if (!ctx.usedPorts.has(p) && !ctx.reservedPorts.has(p)) return p;
    }
    return null; // 该段已用完
  },

  /** 全局顺序分配(取所有分段中最小的可用端口) */
  sequential(ctx) {
    const all = ctx.segments
      .flatMap(s => range(s.start, s.end))
      .sort((a, b) => a - b);
    for (const p of all) {
      if (!ctx.usedPorts.has(p) && !ctx.reservedPorts.has(p)) return p;
    }
    return null;
  },

  /** 在类别分段内随机分配(最多尝试 100 次) */
  random(ctx) {
    const seg = ctx.segments.find(s => s.category === ctx.category) || ctx.segments[ctx.segments.length - 1];
    for (let i = 0; i < 100; i++) {
      const p = seg.start + Math.floor(Math.random() * (seg.end - seg.start + 1));
      if (!ctx.usedPorts.has(p) && !ctx.reservedPorts.has(p)) return p;
    }
    // 随机失败退化为顺序
    return STRATEGIES.segmented(ctx);
  }
};

function range(start, end) {
  const arr = [];
  for (let p = start; p <= end; p++) arr.push(p);
  return arr;
}

/** 分配一个端口。返回端口号,池满返回 null。 */
function allocate(db, category) {
  const usedPorts = new Set(db.projects.filter(p => p.port).map(p => p.port));
  const ctx = {
    usedPorts,
    reservedPorts: new Set(db.settings.reservedPorts || []),
    segments: db.settings.segments || [],
    category: category || 'tool'
  };
  const strategy = STRATEGIES[db.settings.strategy] || STRATEGIES.segmented;
  return strategy(ctx);
}

/** 释放端口(项目删除时调用,端口回收到池中) */
function release(db, port) {
  // JSON 存储下释放即“没有项目占用该端口”,无需额外操作,保留接口便于未来扩展
  return port;
}

/** 检测本机端口当前是否真的空闲(可 bind)。 */
function isPortFreeOnHost(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

/** 获取端口池总览:每个分段的使用情况。 */
function poolOverview(db) {
  const usedPorts = new Set(db.projects.filter(p => p.port).map(p => p.port));
  return (db.settings.segments || []).map(seg => {
    const used = [];
    for (let p = seg.start; p <= seg.end; p++) {
      if (usedPorts.has(p)) used.push(p);
    }
    const total = seg.end - seg.start + 1;
    return {
      category: seg.category,
      label: seg.label,
      start: seg.start,
      end: seg.end,
      total,
      usedCount: used.length,
      freeCount: total - used.length,
      usedPorts: used
    };
  });
}

module.exports = { STRATEGIES, allocate, release, isPortFreeOnHost, poolOverview };

/**
 * 简单的 JSON 文件持久化存储层。
 * 数据结构:
 * {
 *   projects: [ { id, name, description, category, port, status, path, createdAt, updatedAt } ],
 *   settings: {
 *     strategy: 'segmented' | 'sequential' | 'random',
 *     reservedPorts: [ ... ],        // 保留端口,永不分配(如管理服务自身端口)
 *     segments: [ { category, label, start, end } ]  // 端口分段( segmented 策略使用 )
 *   }
 * }
 *
 * 设计说明: store 只负责读写,不关心端口分配逻辑,分配逻辑在 allocator.js。
 * 这样未来要换成 SQLite/MySQL 时,只需替换本文件,接口保持不变。
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DB = {
  // projects: { id, name, path, parentId, port(可为null, 如纯目录根项目), category, status, description, createdAt, updatedAt }
  projects: [],
  // services: { id, type, name, config, configMeta: { KEY: { category, label, remark } }, configCategories, icon, createdAt }
  services: [],
  // serviceTypes: { value, label } // 用户手动添加的服务类型
  serviceTypes: [],
  // allocations: { id, serviceId, projectName, resource(schema/namespace/db...), value, createdAt }
  allocations: [],
  settings: {
    strategy: 'segmented',
    reservedPorts: [9000], // 管理服务自身端口
    segments: [
      { category: 'web', label: '前端/Web 项目', start: 3000, end: 3999 },
      { category: 'api', label: '后端/API 项目', start: 4000, end: 4999 },
      { category: 'service', label: '微服务/长驻服务', start: 5000, end: 5999 },
      { category: 'tool', label: '工具/其他', start: 8000, end: 8999 }
    ]
  }
};

function createStore(dataDir) {
  const DATA_DIR = path.resolve(dataDir);
  const DB_FILE = path.join(DATA_DIR, 'db.json');
  let cache = null;

  function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  function load() {
    if (cache) return cache;
    ensureDir();
    if (!fs.existsSync(DB_FILE)) {
      cache = JSON.parse(JSON.stringify(DEFAULT_DB));
      save();
      return cache;
    }
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      // 文件损坏时备份并重建
      fs.copyFileSync(DB_FILE, DB_FILE + '.bak.' + Date.now());
      cache = JSON.parse(JSON.stringify(DEFAULT_DB));
      save();
    }
    // 兼容老数据:补齐 settings / parentId 字段
    cache.settings = Object.assign({}, DEFAULT_DB.settings, cache.settings || {});
    if (!Array.isArray(cache.projects)) cache.projects = [];
    if (!Array.isArray(cache.services)) cache.services = [];
    if (!Array.isArray(cache.serviceTypes)) cache.serviceTypes = [];
    if (!Array.isArray(cache.allocations)) cache.allocations = [];
    cache.projects.forEach(p => { if (p.parentId === undefined) p.parentId = ''; });
    return cache;
  }

  function save() {
    ensureDir();
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8');
    fs.renameSync(tmp, DB_FILE); // 原子写入,避免写一半损坏
  }

  function getDb() {
    return load();
  }

  function update(mutator) {
    const db = load();
    const result = mutator(db);
    save();
    return result;
  }

  return { getDb, update, DEFAULT_DB };
}

module.exports = { ...createStore(path.join(__dirname, 'data')), createStore };

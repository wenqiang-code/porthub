const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateResources, toEnv } = require('./services');

function redisService() {
  return { id: 'redis-service', type: 'redis', config: { host: 'redis.local', port: 6379, databases: 16 } };
}

function fullDatabaseAllocations() {
  return Array.from({ length: 16 }, (_, index) => ({
    id: `allocation-${index}`,
    serviceId: 'redis-service',
    projectName: `project-${index}`,
    resource: 'db',
    value: String(index),
    createdAt: '2026-09-01T00:00:00.000Z'
  }));
}

test('Redis 保留已有逻辑 DB 分配', () => {
  const db = { allocations: fullDatabaseAllocations() };
  const resources = allocateResources(db, redisService(), 'project-7');

  assert.deepEqual(resources, { db: '7', isolation: 'database' });
  assert.equal(db.allocations.length, 16);
});

test('Redis 编号池满后分配幂等键前缀', () => {
  const db = { allocations: fullDatabaseAllocations() };
  const service = redisService();

  const first = allocateResources(db, service, 'ai-cooking');
  const repeated = allocateResources(db, service, 'ai-cooking');
  const another = allocateResources(db, service, 'ai-ordering');

  assert.deepEqual(first, { db: '0', prefix: 'pm:ai_cooking:', isolation: 'prefix' });
  assert.deepEqual(repeated, first);
  assert.deepEqual(another, { db: '0', prefix: 'pm:ai_ordering:', isolation: 'prefix' });
  assert.equal(db.allocations.filter(item => item.resource === 'prefix').length, 2);
});

test('Redis 前缀分配输出完整环境变量', () => {
  const service = redisService();
  const env = toEnv(service, { db: '0', prefix: 'pm:ai_cooking:', isolation: 'prefix' });

  assert.equal(env.REDIS_DB, '0');
  assert.equal(env.REDIS_PREFIX, 'pm:ai_cooking:');
  assert.equal(env.REDIS_ISOLATION, 'prefix');
});

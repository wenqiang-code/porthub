const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { deflateSync } = require('node:zlib');
const { createStore } = require('./store');
const { createServicesRouter } = require('./routes/services');
const { servicePatch, validateIcon, crc32 } = require('./service-validation');

function png(width = 1, height = 1) {
  const chunk = (kind, data) => {
    const content = Buffer.concat([Buffer.from(kind), data]);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    content.copy(result, 4);
    result.writeUInt32BE(crc32(content), result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-services-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createStore(dir);
  const router = createServicesRouter(store);
  function call(method, routePath, body = {}, params = {}) {
    const layer = router.stack.find(item => item.route?.path === routePath && item.route.methods[method]);
    assert.ok(layer, `missing ${method} ${routePath}`);
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = structuredClone(value); return this; } };
    layer.route.stack[0].handle({ body, params }, response);
    return response;
  }
  return { store, dir, call };
}

test('自定义配置中文持久化、图标和元数据不影响配置下发', t => {
  const { dir, call } = fixture(t);
  const config = { API_SERVER: '测试服务器', PORT: 8080, EMPTY: '' };
  const configMeta = { API_SERVER: { category: '连接信息', label: '服务器地址', remark: '仅供测试使用' } };
  const icon = png();
  const created = call('post', '/', { type: 'custom', name: '测试公共服务', config, configMeta, icon, configCategories: ['连接信息', '空分类'] });
  assert.equal(created.statusCode, 201);
  const persisted = createStore(dir).getDb().services[0];
  assert.deepEqual(persisted.config, config);
  assert.deepEqual(persisted.configMeta, configMeta);
  assert.deepEqual(persisted.configCategories, ['连接信息', '空分类']);
  assert.equal(persisted.icon, icon);
  assert.equal(call('get', '/').body[0].icon, icon);
  const bundle = call('post', '/provision', { projectName: '测试项目' }).body;
  assert.deepEqual(bundle.services.custom.config, config);
  assert.deepEqual(bundle.env, { CUSTOM_API_SERVER: '测试服务器', CUSTOM_PORT: '8080' });
  assert.equal(bundle.services.custom.configMeta, undefined);
  assert.equal(bundle.services.custom.icon, undefined);
});

test('旧客户端更新保留元数据和图标，删除 KEY 清理元数据', t => {
  const { call } = fixture(t);
  const created = call('post', '/', { type: 'custom', name: '兼容性测试', config: { KEY: 3, REMOVED: 'old' },
    configMeta: { KEY: { category: '基本配置', label: '次数', remark: '保留数字' }, REMOVED: { label: '删除项' } },
    configCategories: ['基本配置'], icon: png() }).body;
  const enabled = call('put', '/:id', { enabled: false }, { id: created.id }).body;
  assert.deepEqual(enabled.configMeta, created.configMeta);
  const updated = call('put', '/:id', { config: { KEY: 4 } }, { id: created.id }).body;
  assert.deepEqual(updated.configMeta, { KEY: created.configMeta.KEY });
  assert.deepEqual(updated.configCategories, ['基本配置']);
  assert.equal(updated.icon, created.icon);
  assert.equal(call('put', '/:id', { icon: null }, { id: created.id }).body.icon, null);
});

test('无元数据的旧服务保持数字类型，不要求迁移', t => {
  const { store, call } = fixture(t);
  store.update(db => db.services.push({ id: 'legacy', type: 'custom', name: '旧服务', config: { COUNT: 12 }, createdAt: '2026-01-01' }));
  assert.equal(call('get', '/').body[0].config.COUNT, 12);
  const result = call('put', '/:id', { name: '旧服务改名' }, { id: 'legacy' });
  assert.equal(result.body.config.COUNT, 12);
  assert.equal(result.body.configMeta, undefined);
});

test('无效保存、重名、空 KEY 和归一化重复 KEY 都不改变数据库', t => {
  const { store, dir, call } = fixture(t);
  const created = call('post', '/', { type: 'custom', name: '保存测试', config: { KEY: 5 } }).body;
  const before = fs.readFileSync(path.join(dir, 'db.json'), 'utf8');
  for (const patch of [{ name: ' ' }, { config: [] }, { config: { ' ': 'x' } },
    { config: { ' KEY ': 'a', KEY: 'b' } }, { configMeta: null },
    { configMeta: { KEY: { label: 1 } } }, { name: '不能部分保存', icon: 'bad' }]) {
    assert.equal(call('put', '/:id', patch, { id: created.id }).statusCode, 400);
    assert.equal(store.getDb().services[0].name, '保存测试');
    assert.equal(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'), before);
  }
  assert.equal(call('post', '/', { type: 'custom', name: '保存测试' }).statusCode, 409);
  assert.equal(call('post', '/', { type: '__proto__', name: '非法类型' }).statusCode, 400);
  assert.equal(call('put', '/:id', {}, { id: 'missing' }).statusCode, 404);
});

test('内置服务同样支持图标新增、更换与恢复默认', t => {
  const { call } = fixture(t);
  const created = call('post', '/', { type: 'mysql', name: '图标测试', config: { port: 3306 }, icon: png() }).body;
  const changed = call('put', '/:id', { icon: png(2, 1) }, { id: created.id });
  assert.equal(changed.body.icon, png(2, 1));
  assert.equal(changed.body.config.port, 3306);
  assert.equal(call('put', '/:id', { icon: null }, { id: created.id }).body.icon, null);
});

test('服务端拒绝伪造、损坏、超大及超尺寸图标', () => {
  assert.equal(validateIcon(png(128, 128)), png(128, 128));
  for (const icon of ['https://example.test/icon.png', 'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,' + Buffer.from('not a PNG').toString('base64'), png(129, 1),
    png().slice(0, -8), 'data:image/png;base64,' + 'A'.repeat(140000)]) {
    assert.throws(() => validateIcon(icon));
  }
  const damaged = Buffer.from(png().split(',')[1], 'base64');
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => validateIcon('data:image/png;base64,' + damaged.toString('base64')), /校验/);
});

test('元数据不污染原型，配置 KEY 归一化且值不转换', () => {
  const payload = JSON.parse('{"config":{"__proto__":7," KEY ":false},"configMeta":{"__proto__":{"label":"原型名称"}," KEY ":{"category":"未分类"}}}');
  const result = servicePatch(payload);
  assert.equal(Object.hasOwn(result.config, '__proto__'), true);
  assert.equal(result.config.__proto__, 7);
  assert.equal(result.config.KEY, false);
  assert.equal(result.configMeta.KEY.category, '');
  assert.equal({}.label, undefined);
});

const editor = () => import(pathToFileURL(path.join(__dirname, '../client/src/service-editor.mjs')).href);
test('前端编辑草稿隔离；移动、重命名、空分类删除与取消不改变原数据', async () => {
  const { createDraft, serializeDraft, renameCategory, deleteCategory } = await editor();
  const original = { config: { PORT: 9001, NOTE: '中文', FLAG: false, JSON: { name: '中文' }, NIL: null }, configCategories: ['空分类'] };
  const draft = createDraft(original);
  draft.categories.push('连接信息');
  draft.rows[0].category = '连接信息';
  draft.rows[0].label = '端口';
  renameCategory(draft, '连接信息', '网络设置');
  assert.throws(() => deleteCategory(draft, '网络设置'), /仅可删除空分类/);
  deleteCategory(draft, '空分类');
  const result = serializeDraft(draft.rows, draft.categories);
  assert.deepEqual(result.config, original.config);
  assert.equal(result.configMeta.PORT.category, '网络设置');
  assert.equal(result.configMeta.PORT.label, '端口');
  assert.equal(original.configMeta, undefined);
  assert.deepEqual(original.configCategories, ['空分类']);
  assert.ok(createDraft(original).rows.every(row => row.category === ''));
  draft.rows[1].text = '修改后的中文';
  assert.equal(serializeDraft(draft.rows, draft.categories).config.NOTE, '修改后的中文');
  assert.equal(original.config.NOTE, '中文');
});

test('前端禁止空 KEY、跨分类重复 KEY，校验错误定位到对应行', async () => {
  const { createDraft, createRow, serializeDraft } = await editor();
  const draft = createDraft({ config: { KEY: 12 } });
  const row = createRow('另一类');
  draft.rows.push(row);
  assert.throws(() => serializeDraft(draft.rows, []), error => error.rowId === row.id && /请填写/.test(error.message));
  row.key = ' KEY ';
  assert.throws(() => serializeDraft(draft.rows, []), error => error.category === '另一类' && /重复/.test(error.message));
});

test('前端上传在解码前拒绝非法格式和超过 2MB 的图片', async () => {
  const { normalizeIcon } = await editor();
  await assert.rejects(normalizeIcon({ type: 'image/svg+xml', size: 10 }), /PNG/);
  await assert.rejects(normalizeIcon({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }), /2MB/);
});

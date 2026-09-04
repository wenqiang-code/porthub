// Isolated browser/API acceptance server. PM_TEST_PORT must come from PortHub.
const express = require('../server/node_modules/express');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createStore } = require('../server/store');
const { createServicesRouter } = require('../server/routes/services');
const port = Number(process.env.PM_TEST_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 9000) throw new Error('Set a PortHub-allocated PM_TEST_PORT');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-services-browser-'));
const store = createStore(directory);
store.update(db => {
  db.services.push({ id: 'custom-test', type: 'custom', name: '分类配置验收服务', enabled: true,
    config: { API_SERVER: '测试服务器', PORT: 8080, ...Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`TEST_${index}`, `测试值 ${index}`])) } });
  db.services.push({ id: 'mysql-test', type: 'mysql', name: 'MySQL 图标验收', enabled: true, config: { host: 'test.local', port: 3306 } });
  for (let i = 0; i < 24; i++) db.services.push({ id: `extra-${i}`, type: 'custom', name: `布局验收服务 ${i}`, enabled: true, config: {} });
});
const app = express();
app.use(require('../server/json-body'));
app.use('/api/services', createServicesRouter(store));
app.get('/api/health', (req, res) => res.json({ ok: true, isolated: true }));
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.status === 413 ? '请求内容过大' : error.message }));
const server = app.listen(port, '127.0.0.1', () => console.log(`Isolated services fixture: http://127.0.0.1:${port}/services`));
function close() {
  server.close(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);

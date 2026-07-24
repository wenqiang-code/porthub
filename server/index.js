const express = require('express');
const path = require('path');
const store = require('./store');

const projectsRouter = require('./routes/projects');
const portsRouter = require('./routes/ports');
const settingsRouter = require('./routes/settings');
const servicesRouter = require('./routes/services');

const app = express();
const PORT = process.env.PM_PORT || 9000; // 管理服务固定端口(默认 9000,已在保留端口中)

app.use(express.json());

// 简单请求日志
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t}ms)`);
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/projects', projectsRouter);
app.use('/api/ports', portsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/services', servicesRouter);

// 生产模式:托管前端构建产物
const distDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      // index.html 不缓存,保证每次发版后浏览器能拿到最新的资源 hash
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(distDir, 'index.html'));
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 启动前确保数据库文件存在
store.getDb();

app.listen(PORT, () => {
  console.log(`✔ Projects Manager 已启动: http://localhost:${PORT}`);
  console.log(`✔ API 前缀: http://localhost:${PORT}/api`);
});

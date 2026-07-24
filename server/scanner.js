/**
 * 磁盘扫描器 —— 发现指定根目录下的所有项目,并尽力探测其使用的端口。
 *
 * 项目判定: 目录中存在 package.json
 * 端口探测来源(按优先级):
 *  1. .env / .env.development / .env.local 中的 PORT= 或 VITE_PORT=
 *  2. vite.config.{js,ts,mjs,mts} 中的 server.port 或 port: N
 *  3. package.json scripts 中的 --port N / --port=N / -p N / PORT=N
 * 类别推测: 依赖含 vue/react/vite → web;express/koa/fastify/@nestjs → api;否则 tool。
 *           若探测端口落在某个分段内,优先用该分段的类别。
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage']);
const SELF_DIR = path.resolve(__dirname, '..'); // 不扫描管理中心自身

/** 从文本中用一组正则提取第一个端口 */
function extractPort(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const p = Number(m[1]);
      if (p >= 1 && p <= 65535) return p;
    }
  }
  return null;
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

/** 探测单个项目目录的端口 */
function detectPort(dir, pkg) {
  // 1. .env 系列
  for (const envFile of ['.env', '.env.development', '.env.local', '.env.production']) {
    const content = readIfExists(path.join(dir, envFile));
    if (content) {
      const p = extractPort(content, [/^\s*(?:VITE_)?PORT\s*=\s*(\d{2,5})\s*$/m]);
      if (p) return p;
    }
  }
  // 2. vite 配置
  for (const cfg of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']) {
    const content = readIfExists(path.join(dir, cfg));
    if (content) {
      const p = extractPort(content, [/port\s*:\s*(\d{2,5})/]);
      if (p) return p;
    }
  }
  // 3. package.json scripts
  const scripts = Object.values(pkg.scripts || {}).join('\n');
  return extractPort(scripts, [
    /--port[=\s]+(\d{2,5})/,
    /(?:^|\s)-p\s+(\d{2,5})/,
    /PORT\s*=\s*(\d{2,5})/
  ]);
}

/** 推测项目类别 */
function guessCategory(pkg, detectedPort, segments) {
  if (detectedPort && segments) {
    const seg = segments.find(s => detectedPort >= s.start && detectedPort <= s.end);
    if (seg) return seg.category;
  }
  const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
  if (deps.some(d => ['vue', 'react', 'react-dom', 'vite', 'next', 'nuxt', '@angular/core'].includes(d))) return 'web';
  if (deps.some(d => ['express', 'koa', 'fastify', '@nestjs/core', 'hapi'].includes(d))) return 'api';
  return 'tool';
}

/**
 * 扫描根目录,返回发现的项目列表(不修改数据)。
 * @param {string} root 根目录
 * @param {number} depth 递归深度(1 = 只看 root 的直接子目录)
 * @param {Array} segments 端口分段(用于类别推测)
 */
function scan(root, depth = 1, segments = []) {
  const found = [];
  const rootAbs = path.resolve(root);
  if (!fs.existsSync(rootAbs) || rootAbs.startsWith(SELF_DIR) || SELF_DIR.startsWith(rootAbs)) {
    if (rootAbs === SELF_DIR) return found;
  }

  function walk(dir, level) {
    if (level > depth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const pkgFile = path.join(dir, 'package.json');
    if (fs.existsSync(pkgFile) && path.resolve(dir) !== SELF_DIR) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
        const detectedPort = detectPort(dir, pkg);
        found.push({
          name: pkg.name || path.basename(dir),
          path: dir,
          detectedPort,
          category: guessCategory(pkg, detectedPort, segments)
        });
        return; // 是项目就不再向下递归
      } catch { /* package.json 损坏则继续向下 */ }
    }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
        walk(path.join(dir, e.name), level + 1);
      }
    }
  }

  walk(rootAbs, 0);
  return found;
}

module.exports = { scan, detectPort, guessCategory };

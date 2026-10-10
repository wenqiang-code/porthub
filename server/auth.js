const crypto = require('crypto');

const COOKIE = 'pm_session';
const sessions = new Map();
const secret = process.env.PM_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const username = process.env.PM_ADMIN_USERNAME || 'admin';
const password = process.env.PM_ADMIN_PASSWORD || 'admin';
if (!process.env.PM_ADMIN_PASSWORD) console.warn('⚠ 未设置 PM_ADMIN_PASSWORD，当前使用默认管理员密码，请尽快修改环境变量');

function sameSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split('='))
    .filter(pair => pair.length === 2).map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]));
}

function issueSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return token;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie).pm_session || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = token && sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function setCookie(res, token, maxAge = 8 * 60 * 60) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearCookie(res) { setCookie(res, '', 0); }

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
  req.user = session.user;
  next();
}

function login(req, res) {
  const body = req.body || {};
  if (!sameSecret(body.username, username) || !sameSecret(body.password, password)) {
    return res.status(401).json({ error: '管理员账号或密码错误' });
  }
  const token = issueSession(username);
  setCookie(res, token);
  res.json({ ok: true, username });
}

function logout(req, res) {
  const session = getSession(req);
  if (session) sessions.delete(session.token);
  clearCookie(res);
  res.json({ ok: true });
}

module.exports = { requireAuth, login, logout, getSession, setCookie, username };

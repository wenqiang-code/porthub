const express = require('express');
const auth = require('../auth');

const router = express.Router();
router.post('/login', auth.login);
router.post('/logout', auth.logout);
router.post('/password', auth.requireAuth, auth.changePassword);
router.get('/me', (req, res) => {
  const session = auth.getSession(req);
  if (!session) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
  res.json({ username: session.user, expiresAt: session.expiresAt });
});

module.exports = router;

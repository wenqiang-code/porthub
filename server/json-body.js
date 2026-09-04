const express = require('express');

// Only service create/update requests carry thumbnails. Other endpoints retain the default limit.
const standard = express.json();
const serviceWrite = express.json({ limit: '1mb' });
module.exports = (req, res, next) => {
  const isServiceWrite = (req.method === 'POST' && /^\/api\/services\/?$/.test(req.path))
    || (req.method === 'PUT' && /^\/api\/services\/[^/]+\/?$/.test(req.path));
  return (isServiceWrite ? serviceWrite : standard)(req, res, next);
};

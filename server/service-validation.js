const { inflateSync } = require('node:zlib');

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} 必须是对象`);
  return value;
}

// PNG chunks include their own checksum; validate the actual image, not a filename or MIME claim.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateIcon(icon) {
  if (icon === null || icon === '') return null;
  if (typeof icon !== 'string' || icon.length > 140000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(icon)) {
    invalid('图标必须是 PNG 图片，且不超过 100KB');
  }
  const encoded = icon.slice('data:image/png;base64,'.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 100 * 1024 || bytes.toString('base64') !== encoded
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    invalid('图标 PNG 数据无效或超过 100KB');
  }
  let offset = 8;
  let width, height, channels;
  let ended = false;
  const imageData = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) invalid('图标 PNG 数据不完整');
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid('图标 PNG 校验失败');
    if (offset === 8 && kind !== 'IHDR') invalid('图标缺少 PNG 头');
    if (kind === 'IHDR') {
      if (offset !== 8 || length !== 13) invalid('图标 PNG 头无效');
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (!width || !height || width > 128 || height > 128) invalid('图标尺寸不能超过 128×128');
      if (chunk[8] !== 8 || !channels || chunk[10] || chunk[11] || chunk[12]) invalid('请上传浏览器规范化后的 PNG 图标');
    } else if (kind === 'IDAT') imageData.push(chunk);
    else if (kind === 'IEND') {
      if (length || end !== bytes.length) invalid('图标 PNG 结束标记无效');
      ended = true;
    } else if (kind[0] === kind[0].toUpperCase()) invalid('不支持的 PNG 数据块');
    offset = end;
  }
  if (!ended || !imageData.length) invalid('图标 PNG 数据不完整');
  const rowBytes = width * channels + 1;
  let pixels;
  try {
    pixels = inflateSync(Buffer.concat(imageData), { maxOutputLength: rowBytes * height });
  } catch { invalid('图标 PNG 像素数据无效'); }
  if (pixels.length !== rowBytes * height) invalid('图标 PNG 像素长度无效');
  for (let row = 0; row < height; row++) {
    if (pixels[row * rowBytes] > 4) invalid('图标 PNG 滤波数据无效');
  }
  return icon;
}

function normalizeConfig(config) {
  object(config, 'config');
  const seen = new Set();
  return Object.fromEntries(Object.entries(config).map(([rawKey, value]) => {
    const key = rawKey.trim();
    if (!key) invalid('配置名称（KEY）不能为空');
    if (seen.has(key)) invalid(`配置名称（KEY）重复：${key}`);
    seen.add(key);
    return [key, value];
  }));
}

function normalizeMeta(config, meta) {
  object(meta, 'configMeta');
  const entries = Object.entries(meta).map(([key, value]) => [key.trim(), value]);
  const mapped = Object.fromEntries(entries);
  return Object.fromEntries(Object.keys(config).filter(key => Object.hasOwn(mapped, key)).map(key => {
    const value = object(mapped[key], '配置元数据');
    const normalized = {};
    for (const field of ['category', 'label', 'remark']) {
      if (value[field] !== undefined && typeof value[field] !== 'string') invalid(`${field} 必须是文本`);
      normalized[field] = (value[field] || '').trim();
    }
    if (normalized.category === '未分类') normalized.category = '';
    return [key, normalized];
  }));
}

// Build the complete patch before touching the store, so invalid saves cannot partially mutate it.
function servicePatch(body, existing = {}) {
  object(body, '请求体');
  const patch = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) invalid('请填写服务名称');
    patch.name = body.name.trim();
  }
  if (body.config !== undefined) patch.config = normalizeConfig(body.config);
  if (body.config !== undefined || body.configMeta !== undefined) {
    patch.configMeta = normalizeMeta(patch.config || existing.config || {}, body.configMeta === undefined ? existing.configMeta || {} : body.configMeta);
  }
  if (body.icon !== undefined) patch.icon = validateIcon(body.icon);
  // Keep empty categories and their order independently of the per-key metadata.
  if (body.configCategories !== undefined) {
    if (!Array.isArray(body.configCategories) || body.configCategories.some(item => typeof item !== 'string')) {
      invalid('configCategories 必须是文本数组');
    }
    patch.configCategories = [...new Set(body.configCategories.map(item => item.trim()).filter(item => item && item !== '未分类'))];
  }
  if (body.enabled !== undefined) patch.enabled = !!body.enabled;
  return patch;
}

module.exports = { servicePatch, validateIcon, crc32 };

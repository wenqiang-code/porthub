let nextRowId = 0;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const categoryLabel = category => category || '未分类';
export const valueText = value => value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');

export function createRow(category = '') {
  return { id: ++nextRowId, key: '', category, label: '', remark: '', text: '', originalText: '', originalValue: '' };
}

export function createDraft(service = {}) {
  const rows = Object.entries(service.config || {}).map(([key, value]) => {
    const meta = Object.hasOwn(service.configMeta || {}, key) ? service.configMeta[key] : {};
    const row = createRow(meta?.category === '未分类' ? '' : meta?.category || '');
    return { ...row, key, label: meta?.label || '', remark: meta?.remark || '',
      text: valueText(value), originalText: valueText(value), originalValue: clone(value) };
  });
  const categories = [...new Set([...(service.configCategories || []), ...rows.map(row => row.category)])]
    .filter(category => category && category !== '未分类');
  return { rows, categories };
}

export function serializeDraft(rows, categories) {
  const keys = new Set();
  const values = [];
  const metadata = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || keys.has(key)) {
      throw Object.assign(new Error(!key ? '请填写配置名称（KEY）' : `配置名称（KEY）重复：${key}`), { rowId: row.id, category: row.category });
    }
    keys.add(key);
    values.push([key, row.text === row.originalText ? clone(row.originalValue) : row.text]);
    metadata.push([key, { category: row.category, label: row.label.trim(), remark: row.remark.trim() }]);
  }
  return { config: Object.fromEntries(values), configMeta: Object.fromEntries(metadata), configCategories: [...categories] };
}

export function renameCategory(draft, previous, name) {
  const category = name.trim();
  if (!category || category === '未分类') throw new Error('请输入其他分类名称');
  if (draft.categories.includes(category) && category !== previous) throw new Error('分类名称已存在');
  draft.categories = draft.categories.map(item => item === previous ? category : item);
  for (const row of draft.rows) if (row.category === previous) row.category = category;
  return category;
}

export function deleteCategory(draft, category) {
  if (!category || draft.rows.some(row => row.category === category)) throw new Error('仅可删除空分类，请先移动或删除其中的配置项');
  draft.categories = draft.categories.filter(item => item !== category);
}

export async function normalizeIcon(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片');
  if (file.size > 2 * 1024 * 1024) throw new Error('原图片不能超过 2MB');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 128 / image.naturalWidth, 128 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const icon = canvas.toDataURL('image/png');
    if (atob(icon.split(',')[1]).length > 100 * 1024) throw new Error('转换后的图标不能超过 100KB');
    return icon;
  } catch (error) {
    throw new Error(error.message.includes('100KB') ? error.message : '图片无法解码，请选择有效图片');
  } finally { URL.revokeObjectURL(url); }
}

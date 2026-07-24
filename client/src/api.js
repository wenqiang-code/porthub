/** 极简 API 封装,基于 fetch */
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // 项目
  listProjects: (params = {}) => request('GET', '/api/projects?' + new URLSearchParams(params)),
  createProject: data => request('POST', '/api/projects', data),
  updateProject: (id, data) => request('PUT', `/api/projects/${id}`, data),
  deleteProject: id => request('DELETE', `/api/projects/${id}`),
  reallocate: id => request('POST', `/api/projects/${id}/reallocate`),
  registerProject: data => request('POST', '/api/projects/register', data),
  batchProjects: data => request('POST', '/api/projects/batch', data),
  scanProjects: data => request('POST', '/api/projects/scan', data),
  // 公共服务
  listServices: () => request('GET', '/api/services'),
  serviceTypes: () => request('GET', '/api/services/types'),
  createService: data => request('POST', '/api/services', data),
  updateService: (id, data) => request('PUT', `/api/services/${id}`, data),
  deleteService: id => request('DELETE', `/api/services/${id}`),
  serviceAllocations: id => request('GET', `/api/services/${id}/allocations`),
  releaseAllocation: allocId => request('DELETE', `/api/services/allocations/${allocId}`),
  provision: data => request('POST', '/api/services/provision', data),
  // 端口
  pool: () => request('GET', '/api/ports/pool'),
  checkPort: port => request('GET', `/api/ports/check/${port}`),
  portOwner: port => request('GET', `/api/ports/owner/${port}`),
  killPort: port => request('POST', `/api/ports/kill/${port}`),
  nextPort: category => request('GET', '/api/ports/next' + (category ? `?category=${category}` : '')),
  // 设置
  getSettings: () => request('GET', '/api/settings'),
  saveSettings: data => request('PUT', '/api/settings', data)
};

export const CATEGORIES = [
  { value: 'web', label: '前端/Web' },
  { value: 'api', label: '后端/API' },
  { value: 'service', label: '微服务' },
  { value: 'tool', label: '工具/其他' }
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

export const CATEGORY_TAG = { web: 'success', api: 'primary', service: 'warning', tool: 'info' };

export const STATUS_TAG = { active: 'success', stopped: 'info', archived: 'danger' };
export const STATUS_LABEL = { active: '运行中', stopped: '已停止', archived: '已归档' };

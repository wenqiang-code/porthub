<template>
  <div class="services-page">
    <div class="toolbar">
      <span class="hint-text">公共服务(MySQL / Redis / Nacos 等)统一在此维护;项目创建时可一键获取配置,schema、命名空间等动态资源自动分配。</span>
      <div style="flex: 1"></div>
      <el-button type="primary" :icon="Plus" @click="openCreate">添加服务</el-button>
    </div>

    <!-- 服务卡片 -->
    <div v-loading="loading" class="services-content">
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon>
        <el-button text @click="load">重试</el-button>
      </el-alert>
      <div class="svc-grid">
        <div v-for="s in services" :key="s.id" class="svc-card" :class="{ disabled: s.enabled === false }" :style="{ '--svc-color': TYPE_COLORS[s.type] || '#4f6df5' }">
          <div class="svc-head">
            <button type="button" class="svc-icon edit-trigger" :aria-label="`编辑 ${s.name} 图标及配置`" @click="openEdit(s)">
              <img v-if="s.icon" :src="s.icon" :alt="`${s.name} 图标`" />
              <el-icon v-else :size="18"><component :is="TYPE_ICONS[s.type] || Box" /></el-icon>
            </button>
            <div class="svc-title">
              <button type="button" class="svc-name edit-trigger" @click="openEdit(s)">{{ s.name }}</button>
              <span class="svc-type">{{ s.typeLabel }}</span>
            </div>
            <el-tooltip :content="s.enabled === false ? '已停用(不下发配置)' : '已启用'" placement="top">
              <el-switch
                :model-value="s.enabled !== false" size="small"
                :aria-label="`启用 ${s.name}`"
                @change="v => toggleEnabled(s, v)" @click.stop
              />
            </el-tooltip>
            <el-dropdown trigger="click" @command="cmd => onCommand(cmd, s)">
              <button type="button" class="svc-more" :aria-label="`${s.name} 更多操作`"><el-icon><MoreFilled /></el-icon></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="allocs">分配记录</el-dropdown-item>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="svc-addr mono" v-if="s.config && s.config.host">{{ s.config.host }}:{{ s.config.port }}</div>
          <div class="svc-addr" v-else-if="s.type === 'custom'">{{ Object.keys(s.config || {}).length }} 个配置项 · {{ categoryCount(s) }} 个分类</div>
          <div class="svc-addr" v-else>服务配置</div>
          <div class="svc-meta">
            <span>动态分配 <b class="mono">{{ s.allocCount }}</b> 项</span>
            <span v-if="s.enabled === false" class="stopped-badge">已停用</span>
          </div>
        </div>
        <button type="button" v-if="!services.length && !loading && !loadError" class="empty-card" @click="openCreate">
          <el-icon :size="22"><Plus /></el-icon>
          <span>添加第一个公共服务</span>
        </button>
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑服务' : '添加服务'" class="service-editor"
      :width="form.type === 'custom' ? '1120px' : '760px'" top="16px" :close-on-click-modal="false"
      :close-on-press-escape="!submitting" :show-close="!submitting" @closed="invalidateIcon">
      <el-form :model="form" label-width="80px" class="service-form" :disabled="submitting">
        <div class="service-basics">
          <div class="icon-editor">
            <span class="icon-preview" :style="{ color: TYPE_COLORS[form.type] || '#4f6df5' }">
              <img v-if="form.icon" :src="form.icon" alt="待保存的服务图标" />
              <el-icon v-else :size="28"><component :is="TYPE_ICONS[form.type] || Box" /></el-icon>
            </span>
            <div class="icon-actions">
              <div><el-button :loading="iconLoading" @click="iconInput.click()">{{ form.icon ? '更换图标' : '上传图标' }}</el-button>
                <el-button text :disabled="!form.icon && !iconLoading" @click="resetIcon">恢复默认</el-button></div>
              <span class="hint">PNG / JPEG / WebP，最大 2MB</span>
            </div>
            <input ref="iconInput" class="file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传服务图标" @change="selectIcon" />
          </div>
          <div class="basic-fields">
            <el-form-item label="类型" required>
              <div class="type-picker">
                <el-select v-model="form.type" style="flex: 1" :disabled="!!editing" @change="applyDefaults">
                <el-option v-for="t in types" :key="t.value" :label="t.label" :value="t.value" />
                </el-select>
                <el-button v-if="!editing" :icon="Plus" aria-label="添加服务类型" @click="addServiceType">添加类型</el-button>
                <el-button v-if="!editing" text type="danger" :disabled="!currentType?.custom" @click="removeServiceType">删除</el-button>
              </div>
            </el-form-item>
            <el-form-item label="名称" required>
              <el-input v-model="form.name" aria-label="服务名称" placeholder="如 本地MySQL" />
            </el-form-item>
          </div>
        </div>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon class="form-error" />
        <div v-if="!isFlexibleType" class="builtin-config">
          <el-form-item v-for="f in currentFields" :key="f.key" :label="f.label">
            <el-input
              v-model="form.config[f.key]"
              :type="f.secret ? 'password' : 'text'"
              :show-password="!!f.secret"
              :placeholder="String(f.default ?? '')"
            />
          </el-form-item>
          <el-form-item v-if="currentResources.length" label="动态分配">
            <div class="res-hint">
              <el-tag v-for="r in currentResources" :key="r.key" size="small" effect="plain">{{ r.label }}</el-tag>
              <span class="hint">每个项目获取配置时自动分配,互不冲突</span>
            </div>
          </el-form-item>
        </div>
        <div v-else class="config-workspace">
          <aside class="category-panel" aria-label="配置分类">
            <div class="category-heading"><b>分类</b><el-button text :icon="Plus" @click="addCategory">新增</el-button></div>
            <nav class="category-list" aria-label="选择配置分类">
              <button v-for="category in allCategories" :key="category" type="button" class="category-option"
                :class="{ selected: activeCategory === category }" :aria-current="activeCategory === category ? 'true' : undefined"
                :disabled="submitting" @click="activeCategory = category">
                <span>{{ categoryLabel(category) }}</span><span class="category-count">{{ countRows(category) }}</span>
              </button>
            </nav>
            <div class="category-actions">
              <el-button text :disabled="!activeCategory" @click="editCategory">重命名</el-button>
              <el-button text type="danger" :disabled="!activeCategory" @click="removeCategory">删除分类</el-button>
            </div>
          </aside>
          <section class="config-panel" :aria-label="`${categoryLabel(activeCategory)}配置项`">
            <div class="config-heading"><div><b>{{ categoryLabel(activeCategory) }}</b><span class="hint">{{ visibleRows.length }} 项配置</span></div>
              <el-button :icon="Plus" @click="addRow">添加配置项</el-button></div>
            <div ref="configScroll" class="config-scroll">
              <el-empty v-if="!visibleRows.length" description="此分类暂无配置项" :image-size="64">
                <el-button type="primary" @click="addRow">添加配置项</el-button>
              </el-empty>
              <article v-for="row in visibleRows" :key="row.id" class="config-item" :data-row-id="row.id" :class="{ invalid: invalidRowId === row.id }">
                <div class="config-item-heading"><b>{{ row.label.trim() || row.key.trim() || '新配置项' }}</b>
                  <el-button text type="danger" :aria-label="`删除配置项 ${row.key || '未命名'}`" @click="removeRow(row)">删除</el-button></div>
                <div class="config-fields">
                  <el-form-item label="分类" label-position="top">
                    <el-select :model-value="categoryLabel(row.category)" @update:model-value="value => row.category = value === '未分类' ? '' : value" aria-label="配置分类">
                      <el-option v-for="category in allCategories" :key="category" :value="categoryLabel(category)" :label="categoryLabel(category)" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="标签" label-position="top"><el-input v-model="row.label" aria-label="配置标签" placeholder="如 服务器地址" /></el-form-item>
                  <el-form-item label="名称（KEY）" label-position="top" required><el-input v-model="row.key" aria-label="配置名称 KEY" placeholder="如 API_SERVER" /></el-form-item>
                  <el-form-item label="值" label-position="top" class="field-wide"><el-input v-model="row.text" aria-label="配置值" type="textarea" :rows="2" resize="none" placeholder="配置值" /></el-form-item>
                  <el-form-item label="备注" label-position="top" class="field-wide"><el-input v-model="row.remark" aria-label="配置备注" type="textarea" :rows="2" resize="none" placeholder="用途、填写说明等（可选）" /></el-form-item>
                </div>
              </article>
            </div>
          </section>
        </div>
      </el-form>
      <template #footer>
        <el-button :disabled="submitting" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="iconLoading" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配记录抽屉 -->
    <el-drawer v-model="allocVisible" :title="`分配记录 · ${allocService?.name || ''}`" size="480px">
      <el-table :data="allocations" size="small" style="width: 100%">
        <el-table-column prop="projectName" label="项目" min-width="130" show-overflow-tooltip />
        <el-table-column prop="resourceLabel" label="资源" width="90" />
        <el-table-column prop="value" label="分配值" min-width="150" show-overflow-tooltip>
          <template #default="{ row }"><span class="mono">{{ row.value }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="70" align="center">
          <template #default="{ row }">
            <el-popconfirm title="释放该分配?" @confirm="releaseAlloc(row)">
              <template #reference><el-button text type="danger" size="small">释放</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无分配记录" /></template>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, MoreFilled, Coin, Compass, Box, Promotion, Message, Connection, Search, Folder } from '@element-plus/icons-vue';
import { api } from '../api';
import { createDraft, createRow, serializeDraft, categoryLabel, renameCategory, deleteCategory, normalizeIcon } from '../service-editor.mjs';

const TYPE_COLORS = {
  mysql: '#4f6df5', redis: '#f5654f', nacos: '#3ddc97',
  mongodb: '#22c55e', rocketmq: '#f59e0b', rabbitmq: '#f97316',
  kafka: '#64748b', elasticsearch: '#06b6d4', minio: '#ef4444',
  custom: '#9a8df5'
};
const TYPE_ICONS = {
  mysql: Coin, redis: Coin, nacos: Compass,
  mongodb: Coin, rocketmq: Promotion, rabbitmq: Message,
  kafka: Connection, elasticsearch: Search, minio: Folder,
  custom: Box
};

const services = ref([]);
const types = ref([]);
const loading = ref(false);
const dialogVisible = ref(false);
const submitting = ref(false);
const editing = ref(null);
const form = ref({ type: 'mysql', name: '', config: {}, icon: null });
const draft = ref(createDraft());
const activeCategory = ref('');
const allCategories = computed(() => ['', ...draft.value.categories]);
const visibleRows = computed(() => draft.value.rows.filter(row => row.category === activeCategory.value));
const configScroll = ref(null);
const iconInput = ref(null);
const iconLoading = ref(false);
const formError = ref('');
const loadError = ref('');
const invalidRowId = ref(null);
let iconRequest = 0;

watch(activeCategory, () => configScroll.value?.scrollTo({ top: 0 }), { flush: 'post' });
watch(dialogVisible, visible => { if (!visible) invalidateIcon(); });
const countRows = category => draft.value.rows.filter(row => row.category === category).length;
const categoryCount = service => {
  const categories = new Set(service.configCategories || []);
  for (const key of Object.keys(service.config || {})) categories.add(service.configMeta?.[key]?.category || '');
  return categories.size;
};

function invalidateIcon() { iconRequest++; iconLoading.value = false; }
function resetIcon() { invalidateIcon(); form.value.icon = null; }
async function selectIcon(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const request = ++iconRequest;
  iconLoading.value = true;
  formError.value = '';
  try {
    const icon = await normalizeIcon(file);
    if (request === iconRequest && dialogVisible.value) form.value.icon = icon;
  } catch (error) {
    if (request === iconRequest) formError.value = error.message;
  } finally { if (request === iconRequest) iconLoading.value = false; }
}

async function askCategory(title, initial = '') {
  try {
    const { value } = await ElMessageBox.prompt('分类仅用于当前服务，名称不能重复', title, {
      inputValue: initial, confirmButtonText: '确定', cancelButtonText: '取消',
      inputValidator: value => {
        const name = (value || '').trim();
        if (!name || name === '未分类') return '请输入其他分类名称';
        if (name !== initial && draft.value.categories.includes(name)) return '分类名称已存在';
        return true;
      }
    });
    return value.trim();
  } catch { return null; }
}
async function addCategory() {
  const name = await askCategory('新增分类');
  if (!name) return;
  draft.value.categories.push(name);
  activeCategory.value = name;
}
async function editCategory() {
  const previous = activeCategory.value;
  const name = await askCategory('重命名分类', previous);
  if (name) activeCategory.value = renameCategory(draft.value, previous, name);
}
async function removeCategory() {
  const category = activeCategory.value;
  if (!category) return;
  const rows = countRows(category);
  if (rows) {
    try {
      await ElMessageBox.confirm(
        `分类「${category}」中有 ${rows} 项配置，删除后将移到“未分类”，是否继续？`,
        '删除分类',
        { type: 'warning', confirmButtonText: '删除并移动配置', cancelButtonText: '取消' }
      );
    } catch { return; }
    for (const row of draft.value.rows) if (row.category === category) row.category = '';
  }
  deleteCategory(draft.value, category);
  activeCategory.value = '';
}
async function addRow() {
  const row = createRow(activeCategory.value);
  draft.value.rows.push(row);
  await nextTick();
  const item = configScroll.value?.querySelector(`[data-row-id="${row.id}"]`);
  scrollToRow(item);
  item?.querySelector('input[aria-label="配置名称 KEY"]')?.focus({ preventScroll: true });
}
function scrollToRow(item) {
  const container = configScroll.value;
  if (container && item) container.scrollTop += item.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
}
function removeRow(row) {
  draft.value.rows = draft.value.rows.filter(item => item.id !== row.id);
  if (invalidRowId.value === row.id) { invalidRowId.value = null; formError.value = ''; }
}

const allocVisible = ref(false);
const allocService = ref(null);
const allocations = ref([]);

const currentFields = computed(() => (types.value.find(t => t.value === form.value.type) || {}).fields || []);
const currentResources = computed(() => (types.value.find(t => t.value === form.value.type) || {}).resources || []);
const currentType = computed(() => types.value.find(t => t.value === form.value.type));
const isFlexibleType = computed(() => !!currentType.value?.custom || form.value.type === 'custom');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    [services.value, types.value] = await Promise.all([api.listServices(), api.serviceTypes()]);
  } catch (e) {
    loadError.value = e.message;
  } finally {
    loading.value = false;
  }
}

function applyDefaults() {
  const t = types.value.find(x => x.value === form.value.type);
  const config = {};
  (t?.fields || []).forEach(f => { config[f.key] = f.default ?? ''; });
  form.value.config = config;
  draft.value = createDraft();
  activeCategory.value = '';
  formError.value = '';
  invalidRowId.value = null;
}

async function addServiceType() {
  try {
    const { value } = await ElMessageBox.prompt('类型名称会显示在服务类型下拉框中', '添加服务类型', {
      confirmButtonText: '添加', cancelButtonText: '取消', inputPlaceholder: '如 Elasticsearch 集群'
    });
    const label = value.trim();
    if (!label) return;
    const created = await api.createServiceType(label);
    types.value = await api.serviceTypes();
    form.value.type = created.value;
    applyDefaults();
    ElMessage.success('服务类型已添加');
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message || '添加服务类型失败');
  }
}

async function removeServiceType() {
  const type = currentType.value;
  if (!type?.custom) return;
  try {
    await ElMessageBox.confirm(`删除服务类型「${type.label}」？`, '删除服务类型', { type: 'warning' });
    await api.deleteServiceType(type.value);
    types.value = await api.serviceTypes();
    form.value.type = types.value.find(item => !item.custom)?.value || 'mysql';
    applyDefaults();
    ElMessage.success('服务类型已删除');
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message || '删除服务类型失败');
  }
}

function openCreate() {
  editing.value = null;
  invalidateIcon();
  form.value = { type: 'mysql', name: '', config: {}, icon: null };
  applyDefaults();
  dialogVisible.value = true;
}

function openEdit(s) {
  editing.value = s;
  invalidateIcon();
  formError.value = '';
  invalidRowId.value = null;
  form.value = { type: s.type, name: s.name, config: JSON.parse(JSON.stringify(s.config || {})), icon: s.icon || null };
  draft.value = createDraft(s);
  activeCategory.value = draft.value.rows[0]?.category || '';
  dialogVisible.value = true;
  nextTick(() => configScroll.value?.scrollTo({ top: 0 }));
}

async function save() {
  if (submitting.value || iconLoading.value) return;
  formError.value = '';
  invalidRowId.value = null;
  if (!form.value.name.trim()) { formError.value = '请填写服务名称'; return; }
  try {
    const body = { type: form.value.type, name: form.value.name, config: form.value.config, icon: form.value.icon };
    if (isFlexibleType.value) {
      Object.assign(body, serializeDraft(draft.value.rows, draft.value.categories));
    }
    submitting.value = true;
    if (editing.value) {
      await api.updateService(editing.value.id, body);
    } else {
      await api.createService(body);
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    load();
  } catch (e) {
    formError.value = e.message;
    if (e.rowId) {
      activeCategory.value = e.category;
      invalidRowId.value = e.rowId;
      await nextTick();
      scrollToRow(configScroll.value?.querySelector(`[data-row-id="${e.rowId}"]`));
    }
  } finally {
    submitting.value = false;
  }
}

async function toggleEnabled(s, v) {
  try {
    await api.updateService(s.id, { enabled: v });
    s.enabled = v;
    ElMessage.success(v ? `「${s.name}」已启用` : `「${s.name}」已停用,项目获取配置时将跳过`);
  } catch (e) {
    ElMessage.error(e.message);
    load();
  }
}

async function onCommand(cmd, s) {
  if (cmd === 'edit') return openEdit(s);
  if (cmd === 'allocs') return openAllocs(s);
  if (cmd === 'delete') {
    try {
      await ElMessageBox.confirm(`删除服务「${s.name}」? 其全部分配记录将一并释放`, '删除服务', { type: 'warning' });
    } catch { return; }
    try {
      const r = await api.deleteService(s.id);
      ElMessage.success(`已删除,释放 ${r.releasedAllocations} 条分配记录`);
      load();
    } catch (e) {
      ElMessage.error(e.message);
    }
  }
}

async function openAllocs(s) {
  allocService.value = s;
  allocVisible.value = true;
  try {
    allocations.value = await api.serviceAllocations(s.id);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function releaseAlloc(row) {
  try {
    await api.releaseAllocation(row.id);
    ElMessage.success('已释放');
    openAllocs(allocService.value);
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(load);
</script>

<style scoped>
.services-page { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; line-height: 1.5; }
.services-content { flex: 1; min-height: 0; overflow: auto; padding: 2px 2px 8px; scrollbar-gutter: stable; }
.services-content > .el-alert { margin-bottom: 12px; }
.services-content, .config-scroll, .category-list, .builtin-config { scrollbar-width: thin; scrollbar-color: #c2c8d3 transparent; }
.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-variant-numeric: tabular-nums; }
.toolbar { display: flex; flex-shrink: 0; gap: 12px; margin-bottom: 16px; align-items: center; }
.hint-text { color: var(--pm-text-3); font-size: 13px; }

.svc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  align-content: start;
}
.svc-card {
  background: #fff;
  border: 1px solid var(--pm-border);
  border-left: 3px solid var(--svc-color);
  border-radius: var(--pm-radius);
  box-shadow: var(--pm-shadow);
  padding: 16px 18px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.svc-card:hover { transform: translateY(-2px); box-shadow: var(--pm-shadow-hover); }
.svc-card.disabled { opacity: 0.55; filter: grayscale(0.5); }
.svc-card.disabled:hover { opacity: 0.85; }
.stopped-badge {
  margin-left: 8px;
  font-size: 12px;
  color: #b45309;
  background: #fffaeb;
  padding: 1px 7px;
  border-radius: 5px;
}
.svc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.svc-icon {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  color: var(--svc-color);
  background: color-mix(in srgb, var(--svc-color) 10%, #fff);
  border-radius: 9px;
  flex-shrink: 0;
  border: 0;
}
.svc-icon img, .icon-preview img { width: 100%; height: 100%; object-fit: contain; border-radius: inherit; }
.edit-trigger { cursor: pointer; font: inherit; transition: color 0.2s, background 0.2s; }
.edit-trigger:hover { color: var(--pm-accent); }
.edit-trigger:focus-visible, .svc-more:focus-visible, .empty-card:focus-visible { outline: 2px solid var(--pm-accent); outline-offset: 3px; }
.svc-name { background: none; border: 0; color: inherit; text-align: left; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; line-height: 1.5; }
.svc-title { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.svc-title b { font-size: 14.5px; }
.svc-type { font-size: 12px; color: var(--pm-text-3); }
.svc-more { color: var(--pm-text-3); background: none; border: 0; cursor: pointer; padding: 4px; border-radius: 6px; }
.svc-more:hover { background: #f3f4f7; color: var(--pm-text); }
.svc-addr { font-size: 13px; color: var(--pm-text-2); margin-bottom: 10px; overflow-wrap: anywhere; }
.svc-meta { font-size: 12px; color: var(--pm-text-3); }
.svc-meta b { color: var(--pm-text-2); }

.empty-card {
  background: transparent;
  font: inherit;
  font-size: 13px;
  border: 1.5px dashed var(--pm-border);
  border-radius: var(--pm-radius);
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--pm-text-3);
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}
.empty-card:hover { border-color: var(--pm-accent); color: var(--pm-accent); }

.res-hint { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hint { font-size: 12px; color: var(--pm-text-3); }

.service-form { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.service-basics { flex-shrink: 0; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 20px; padding: 0 0 16px; }
.type-picker { display: flex; align-items: center; gap: 8px; width: 100%; }
.type-picker .el-button { flex-shrink: 0; }
.icon-editor { display: flex; align-items: center; gap: 12px; min-width: 0; }
.icon-preview { display: flex; justify-content: center; align-items: center; background: var(--pm-bg); border: 1px solid var(--pm-border); width: 60px; height: 60px; border-radius: 12px; flex-shrink: 0; }
.icon-actions { display: flex; flex-direction: column; gap: 6px; }
.icon-actions > div { display: flex; flex-wrap: wrap; gap: 4px; }
.icon-actions .el-button + .el-button { margin-left: 0; }
.file-input { display: none; }
.basic-fields { min-width: 0; }
.basic-fields .el-form-item { margin-bottom: 8px; }
.basic-fields .el-form-item:last-child { margin-bottom: 0; }
.form-error { flex-shrink: 0; margin-bottom: 10px; }
.builtin-config { flex: 1; min-height: 0; overflow: auto; padding: 16px 8px 0 0; border-top: 1px solid var(--pm-border); }
.config-workspace { display: flex; flex: 1; min-height: 0; overflow: hidden; border: 1px solid var(--pm-border); border-radius: 8px; }
.category-panel { width: 206px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; background: #f8f9fb; border-right: 1px solid var(--pm-border); }
.category-heading, .config-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; flex-shrink: 0; min-height: 54px; }
.category-list { flex: 1; min-height: 0; overflow: auto; padding: 0 8px 8px; }
.category-option { display: flex; justify-content: space-between; gap: 10px; width: 100%; padding: 10px; border: 0; border-radius: 6px; background: transparent; color: var(--pm-text-2); cursor: pointer; text-align: left; font: inherit; line-height: 1.5; transition: background 0.2s; }
.category-option > span:first-child { overflow-wrap: anywhere; min-width: 0; }
.category-option:hover { background: #edf0f7; }
.category-option.selected { color: var(--pm-accent-deep); background: var(--el-color-primary-light-9); font-weight: 600; }
.category-option:focus-visible { outline: 2px solid var(--pm-accent); outline-offset: -2px; }
.category-count { font-variant-numeric: tabular-nums; flex-shrink: 0; }
.category-actions { display: flex; flex-shrink: 0; flex-wrap: wrap; justify-content: center; padding: 8px 0; border-top: 1px solid var(--pm-border); }
.category-actions .el-button + .el-button { margin-left: 0; }
.config-panel { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.config-heading { border-bottom: 1px solid var(--pm-border); }
.config-heading > div { min-width: 0; display: flex; align-items: baseline; gap: 10px; }
.config-heading b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.config-heading .hint { flex-shrink: 0; }
.config-scroll { flex: 1; min-height: 0; overflow: auto; padding: 12px; scrollbar-gutter: stable; }
.config-item { border: 1px solid var(--pm-border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.config-item:last-child { margin-bottom: 0; }
.config-item.invalid { border-color: var(--el-color-danger); }
.config-item-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.config-item-heading b { min-width: 0; overflow-wrap: anywhere; }
.config-fields { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 10px 12px; }
.config-fields .el-form-item { margin-bottom: 0; min-width: 0; }
.config-fields .el-select { width: 100%; }
.field-wide { grid-column: 1 / -1; }
@media (max-width: 850px) {
  .service-basics { grid-template-columns: 1fr; gap: 12px; }
  .basic-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .category-panel { width: 156px; }
  .config-fields { grid-template-columns: 1fr 1fr; }
  .config-fields .el-form-item:nth-child(3) { grid-column: 1 / -1; }
  .toolbar { flex-wrap: wrap; }
}
</style>

<style>
.el-dialog.service-editor { display: flex; flex-direction: column; height: min(820px, calc(100dvh - 32px)); max-width: calc(100vw - 32px); margin-bottom: 0; overflow: hidden; line-height: 1.5; }
.service-editor .el-dialog__header, .service-editor .el-dialog__footer { flex-shrink: 0; }
.service-editor .el-dialog__body { display: flex; flex: 1; min-height: 0; min-width: 0; overflow: hidden; padding-top: 8px; padding-bottom: 8px; }
.service-editor .el-form-item__label { font-size: 13px; }
.service-editor .el-input__inner, .service-editor .el-textarea__inner, .service-editor .el-select__wrapper, .service-editor .el-button { font-size: 13px; line-height: 1.5; }
.service-editor .config-fields .el-form-item__label { margin-bottom: 4px; height: auto; line-height: 1.5; }
.service-editor .el-empty { padding: 16px 0; }
</style>

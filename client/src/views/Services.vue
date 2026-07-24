<template>
  <div class="page-scroll services-page">
    <div class="toolbar">
      <span class="hint-text">公共服务(MySQL / Redis / Nacos 等)统一在此维护;项目创建时可一键获取配置,schema、命名空间等动态资源自动分配。</span>
      <div style="flex: 1"></div>
      <el-button type="primary" :icon="Plus" @click="openCreate">添加服务</el-button>
    </div>

    <!-- 服务卡片 -->
    <div class="svc-grid">
      <div v-for="s in services" :key="s.id" class="svc-card" :class="{ disabled: s.enabled === false }" :style="{ '--svc-color': TYPE_COLORS[s.type] || '#4f6df5' }">
        <div class="svc-head">
          <span class="svc-icon"><el-icon :size="18"><component :is="TYPE_ICONS[s.type] || Box" /></el-icon></span>
          <div class="svc-title">
            <b>{{ s.name }}</b>
            <span class="svc-type">{{ s.typeLabel }}</span>
          </div>
          <el-tooltip :content="s.enabled === false ? '已停用(不下发配置)' : '已启用'" placement="top">
            <el-switch
              :model-value="s.enabled !== false" size="small"
              @change="v => toggleEnabled(s, v)" @click.stop
            />
          </el-tooltip>
          <el-dropdown trigger="click" @command="cmd => onCommand(cmd, s)">
            <el-icon class="svc-more"><MoreFilled /></el-icon>
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
        <div class="svc-addr mono" v-else>自定义配置</div>
        <div class="svc-meta">
          <span>动态分配 <b class="mono">{{ s.allocCount }}</b> 项</span>
          <span v-if="s.enabled === false" class="stopped-badge">已停用</span>
        </div>
      </div>
      <div v-if="!services.length && !loading" class="empty-card" @click="openCreate">
        <el-icon :size="22"><Plus /></el-icon>
        <span>添加第一个公共服务</span>
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑服务' : '添加服务'" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="类型" required>
          <el-select v-model="form.type" style="width: 100%" :disabled="!!editing" @change="applyDefaults">
            <el-option v-for="t in types" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如 本地MySQL" />
        </el-form-item>
        <el-form-item v-for="f in currentFields" :key="f.key" :label="f.label">
          <el-input
            v-model="form.config[f.key]"
            :type="f.secret ? 'password' : 'text'"
            :show-password="!!f.secret"
            :placeholder="String(f.default ?? '')"
          />
        </el-form-item>
        <template v-if="form.type === 'custom'">
          <el-form-item v-for="(kv, i) in customPairs" :key="i" :label="'配置' + (i + 1)">
            <div class="kv-row">
              <el-input v-model="kv.key" placeholder="KEY" style="width: 40%" />
              <el-input v-model="kv.value" placeholder="VALUE" style="width: 52%" />
              <el-button text type="danger" @click="customPairs.splice(i, 1)">删</el-button>
            </div>
          </el-form-item>
          <el-button text type="primary" @click="customPairs.push({ key: '', value: '' })">+ 添加配置项</el-button>
        </template>
        <el-form-item v-if="currentResources.length" label="动态分配">
          <div class="res-hint">
            <el-tag v-for="r in currentResources" :key="r.key" size="small" effect="plain">{{ r.label }}</el-tag>
            <span class="hint">每个项目获取配置时自动分配,互不冲突</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="save">保存</el-button>
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
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, MoreFilled, Coin, Compass, Box, Promotion, Message, Connection, Search, Folder } from '@element-plus/icons-vue';
import { api } from '../api';

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
const form = ref({ type: 'mysql', name: '', config: {} });
const customPairs = ref([]);

const allocVisible = ref(false);
const allocService = ref(null);
const allocations = ref([]);

const currentFields = computed(() => (types.value.find(t => t.value === form.value.type) || {}).fields || []);
const currentResources = computed(() => (types.value.find(t => t.value === form.value.type) || {}).resources || []);

async function load() {
  loading.value = true;
  try {
    [services.value, types.value] = await Promise.all([api.listServices(), api.serviceTypes()]);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

function applyDefaults() {
  const t = types.value.find(x => x.value === form.value.type);
  const config = {};
  (t?.fields || []).forEach(f => { config[f.key] = f.default ?? ''; });
  form.value.config = config;
  customPairs.value = [];
}

function openCreate() {
  editing.value = null;
  form.value = { type: 'mysql', name: '', config: {} };
  applyDefaults();
  dialogVisible.value = true;
}

function openEdit(s) {
  editing.value = s;
  form.value = { type: s.type, name: s.name, config: { ...s.config } };
  if (s.type === 'custom') {
    customPairs.value = Object.entries(s.config || {}).map(([key, value]) => ({ key, value }));
  }
  dialogVisible.value = true;
}

async function save() {
  if (!form.value.name.trim()) return ElMessage.warning('请填写服务名称');
  submitting.value = true;
  try {
    const body = { type: form.value.type, name: form.value.name, config: form.value.config };
    if (form.value.type === 'custom') {
      body.config = Object.fromEntries(customPairs.value.filter(p => p.key.trim()).map(p => [p.key.trim(), p.value]));
    }
    if (editing.value) {
      await api.updateService(editing.value.id, body);
    } else {
      await api.createService(body);
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message);
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
.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-variant-numeric: tabular-nums; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.hint-text { color: var(--pm-text-3); font-size: 13px; }

.svc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
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
  font-size: 11px;
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
}
.svc-title { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.svc-title b { font-size: 14.5px; }
.svc-type { font-size: 12px; color: var(--pm-text-3); }
.svc-more { color: var(--pm-text-3); cursor: pointer; padding: 4px; border-radius: 6px; }
.svc-more:hover { background: #f3f4f7; color: var(--pm-text); }
.svc-addr { font-size: 13px; color: var(--pm-text-2); margin-bottom: 10px; }
.svc-meta { font-size: 12px; color: var(--pm-text-3); }
.svc-meta b { color: var(--pm-text-2); }

.empty-card {
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

.kv-row { display: flex; gap: 8px; width: 100%; }
.res-hint { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hint { font-size: 12px; color: var(--pm-text-3); }
</style>

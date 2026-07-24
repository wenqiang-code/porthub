<template>
  <div v-loading="loading" class="page-scroll settings-page">
    <!-- 分配策略 -->
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">分配策略</div>
          <div class="panel-sub">新端口如何从未使用的端口中挑选</div>
        </div>
      </div>
      <div class="strategy-grid">
        <div
          v-for="s in STRATEGIES" :key="s.value"
          class="strategy-card" :class="{ active: settings.strategy === s.value }"
          @click="settings.strategy = s.value"
        >
          <div class="strategy-radio"><i v-if="settings.strategy === s.value"></i></div>
          <div class="strategy-body">
            <div class="strategy-name">
              {{ s.name }}
              <span v-if="s.recommended" class="recommend">推荐</span>
            </div>
            <div class="strategy-desc">{{ s.desc }}</div>
            <div class="strategy-demo mono">{{ s.demo }}</div>
          </div>
        </div>
      </div>

      <div class="field-row">
        <div class="field-label">保留端口</div>
        <div class="field-body">
          <el-select
            v-model="settings.reservedPorts" multiple filterable allow-create
            default-first-option placeholder="输入端口号后回车" style="width: 100%"
          >
            <el-option v-for="p in settings.reservedPorts" :key="p" :label="p" :value="Number(p)" />
          </el-select>
          <div class="field-hint">保留端口永不分配(如本管理服务使用的 <b class="mono">9000</b>)</div>
        </div>
      </div>
    </div>

    <!-- 端口分段 -->
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">端口分段</div>
          <div class="panel-sub">不同类别项目从各自的端口段中分配</div>
        </div>
        <el-button size="small" :icon="Plus" @click="addSegment">添加分段</el-button>
      </div>
      <el-table :data="settings.segments" style="width: 100%" size="small">
        <el-table-column label="类别标识" width="160">
          <template #default="{ row }"><el-input v-model="row.category" placeholder="如 web" /></template>
        </el-table-column>
        <el-table-column label="显示名称" min-width="170">
          <template #default="{ row }"><el-input v-model="row.label" placeholder="如 前端/Web 项目" /></template>
        </el-table-column>
        <el-table-column label="起始端口" width="150">
          <template #default="{ row }"><el-input-number v-model="row.start" :min="1" :max="65535" controls-position="right" style="width: 120px" /></template>
        </el-table-column>
        <el-table-column label="结束端口" width="150">
          <template #default="{ row }"><el-input-number v-model="row.end" :min="1" :max="65535" controls-position="right" style="width: 120px" /></template>
        </el-table-column>
        <el-table-column label="容量" width="110">
          <template #default="{ row }"><span class="capacity mono">{{ Math.max(0, row.end - row.start + 1).toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ $index }">
            <el-button size="small" type="danger" plain @click="settings.segments.splice($index, 1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="field-hint" style="margin-top: 10px">
        分段之间不能重叠;已分配的端口必须仍落在某个分段内,否则保存会被拒绝。
      </div>
    </div>

    <!-- 操作栏 -->
    <div class="save-bar">
      <span v-if="dirtyHint" class="dirty-hint">配置已修改,记得保存</span>
      <el-button @click="load">还原</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '../api';

const STRATEGIES = [
  {
    value: 'segmented', name: '分段分配', recommended: true,
    desc: '按项目类别(web/api/service/tool)在各自端口段内取最小可用端口',
    demo: 'web → 3000, 3001, 3002 …'
  },
  {
    value: 'sequential', name: '全局顺序',
    desc: '所有项目在整个端口池中统一按从小到大分配',
    demo: '3000, 3001, 3002, 3003 …'
  },
  {
    value: 'random', name: '随机分配',
    desc: '在类别端口段内随机挑选空闲端口',
    demo: 'web → 3427, 3058, 3791 …'
  }
];

const loading = ref(false);
const saving = ref(false);
const settings = ref({ strategy: 'segmented', reservedPorts: [], segments: [] });
const snapshot = ref('');

const dirtyHint = computed(() => snapshot.value && snapshot.value !== JSON.stringify(settings.value));

async function load() {
  loading.value = true;
  try {
    settings.value = await api.getSettings();
    snapshot.value = JSON.stringify(settings.value);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

function addSegment() {
  settings.value.segments.push({ category: 'custom', label: '自定义分段', start: 6000, end: 6999 });
}

async function save() {
  saving.value = true;
  try {
    const body = {
      ...settings.value,
      reservedPorts: settings.value.reservedPorts.map(Number)
    };
    await api.saveSettings(body);
    ElMessage.success('配置已保存');
    load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-variant-numeric: tabular-nums; }
.settings-page { display: flex; flex-direction: column; gap: 14px; }

/* ---------- 面板 ---------- */
.panel {
  background: #fff;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  box-shadow: var(--pm-shadow);
  padding: 18px 20px;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.panel-title { font-size: 15px; font-weight: 600; }
.panel-sub { font-size: 12px; color: var(--pm-text-3); margin-top: 2px; }

/* ---------- 策略卡片 ---------- */
.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.strategy-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  border: 1.5px solid var(--pm-border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.strategy-card:hover { border-color: #c3cdf0; background: #fafbff; }
.strategy-card.active {
  border-color: var(--pm-accent);
  background: #f5f7ff;
  box-shadow: 0 2px 10px rgba(79, 109, 245, 0.12);
}
.strategy-radio {
  width: 18px; height: 18px;
  border: 1.5px solid #c9cfdb;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s ease;
}
.strategy-card.active .strategy-radio { border-color: var(--pm-accent); }
.strategy-radio i {
  width: 9px; height: 9px;
  border-radius: 50%;
  background: var(--pm-accent);
}
.strategy-name { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.recommend {
  font-size: 11px;
  font-weight: 500;
  color: var(--pm-accent);
  background: rgba(79, 109, 245, 0.1);
  padding: 1px 7px;
  border-radius: 5px;
}
.strategy-desc { font-size: 12.5px; color: var(--pm-text-2); line-height: 1.6; margin-top: 5px; }
.strategy-demo {
  font-size: 12px;
  color: var(--pm-text-3);
  background: #f3f4f7;
  border-radius: 5px;
  padding: 4px 8px;
  margin-top: 8px;
  display: inline-block;
}

/* ---------- 字段行 ---------- */
.field-row { display: flex; gap: 16px; align-items: flex-start; }
.field-label { width: 80px; flex-shrink: 0; font-size: 13.5px; font-weight: 500; padding-top: 6px; }
.field-body { flex: 1; }
.field-hint { font-size: 12px; color: var(--pm-text-3); margin-top: 6px; }
.field-hint b { color: var(--pm-text-2); }

.capacity { font-weight: 600; color: var(--pm-text-2); }

/* ---------- 保存栏 ---------- */
.save-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  background: #fff;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  box-shadow: var(--pm-shadow);
  padding: 12px 16px;
}
.dirty-hint { font-size: 12px; color: #b45309; margin-right: auto; }
</style>

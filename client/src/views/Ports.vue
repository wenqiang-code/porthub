<template>
  <div class="page-scroll ports-page">
    <!-- 顶部总览 -->
    <div class="overview">
      <div class="stat">
        <span class="stat-value mono">{{ pool.length }}</span>
        <span class="stat-label">端口分段</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-value mono">{{ totals.total.toLocaleString() }}</span>
        <span class="stat-label">端口总容量</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-value mono used">{{ totals.used }}</span>
        <span class="stat-label">已分配</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-value mono free">{{ totals.free.toLocaleString() }}</span>
        <span class="stat-label">空闲</span>
      </div>
      <div class="overview-usage">
        <div class="usage-track">
          <div class="usage-fill" :style="{ width: usagePercent + '%' }"></div>
        </div>
        <span class="usage-text mono">{{ usagePercent }}% 已用</span>
      </div>
    </div>

    <!-- 分段卡片 -->
    <div class="seg-grid">
      <div v-for="seg in pool" :key="seg.category" class="seg-card" :style="{ '--seg-color': SEG_COLORS[seg.category] || '#4f6df5' }">
        <div class="seg-top">
          <div class="seg-title">
            <span class="seg-dot"></span>
            <span class="seg-label">{{ seg.label }}</span>
          </div>
          <span class="seg-cat mono">{{ seg.category }}</span>
        </div>
        <div class="seg-range mono">{{ seg.start }} – {{ seg.end }}</div>
        <div class="seg-numbers">
          <span class="seg-fraction mono">
            <b>{{ seg.usedCount }}</b>
            <i>/</i>
            <span>{{ seg.total.toLocaleString() }}</span>
          </span>
          <span class="seg-percent mono">{{ seg.total ? Math.round((seg.usedCount / seg.total) * 100) : 0 }}%</span>
        </div>
        <div class="seg-track">
          <div class="seg-fill" :style="{ width: (seg.total ? (seg.usedCount / seg.total) * 100 : 0) + '%' }"></div>
        </div>
        <div class="seg-free">空闲 <b class="mono">{{ seg.freeCount.toLocaleString() }}</b></div>
        <div class="seg-ports" v-if="seg.usedPorts.length">
          <span v-for="p in seg.usedPorts.slice(0, 10)" :key="p" class="used-chip mono">{{ p }}</span>
          <span v-if="seg.usedPorts.length > 10" class="more">+{{ seg.usedPorts.length - 10 }}</span>
        </div>
        <div class="seg-ports empty" v-else>暂无占用</div>
      </div>
    </div>

    <!-- 端口检查工具 -->
    <div class="check-card">
      <div class="check-title">端口检查</div>
      <div class="check-row">
        <el-input-number v-model="checkPort" :min="1" :max="65535" controls-position="right" style="width: 150px" />
        <el-button type="primary" :loading="checking" @click="check">检查</el-button>
        <transition name="el-fade-in">
          <div v-if="checkResult" class="check-result">
            <span v-if="checkResult.reserved" class="result-badge danger">保留端口</span>
            <span v-else-if="checkResult.allocatedTo" class="result-badge warning">
              已分配给 <b>{{ checkResult.allocatedTo.name }}</b>
            </span>
            <span v-else class="result-badge success">未分配</span>
            <span class="result-badge" :class="checkResult.hostFree ? 'success' : 'danger'">
              本机{{ checkResult.hostFree ? '空闲' : '被进程占用' }}
            </span>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const SEG_COLORS = {
  web: '#4f6df5',
  api: '#3ddc97',
  service: '#f5a54f',
  tool: '#9a8df5'
};

const pool = ref([]);
const checkPort = ref(3000);
const checkResult = ref(null);
const checking = ref(false);

const totals = computed(() => {
  const total = pool.value.reduce((s, x) => s + x.total, 0);
  const used = pool.value.reduce((s, x) => s + x.usedCount, 0);
  return { total, used, free: total - used };
});
const usagePercent = computed(() =>
  totals.value.total ? Math.round((totals.value.used / totals.value.total) * 1000) / 10 : 0
);

async function load() {
  try {
    pool.value = await api.pool();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function check() {
  checking.value = true;
  checkResult.value = null;
  try {
    checkResult.value = await api.checkPort(checkPort.value);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    checking.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-variant-numeric: tabular-nums; }

/* ---------- 顶部总览 ---------- */
.overview {
  display: flex;
  align-items: center;
  gap: 22px;
  background: #10141c;
  border-radius: var(--pm-radius);
  padding: 18px 26px;
  margin-bottom: 16px;
  box-shadow: var(--pm-shadow);
}
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat-value { font-size: 24px; font-weight: 700; color: #fff; line-height: 1.1; }
.stat-value.used { color: #8fa3f9; }
.stat-value.free { color: var(--pm-green); }
.stat-label { font-size: 12px; color: rgba(255, 255, 255, 0.45); }
.stat-divider { width: 1px; height: 34px; background: rgba(255, 255, 255, 0.1); }
.overview-usage { flex: 1; display: flex; align-items: center; gap: 14px; min-width: 180px; }
.usage-track {
  flex: 1; height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  overflow: hidden;
}
.usage-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--pm-accent), var(--pm-green));
  border-radius: 999px;
  transition: width 0.6s ease;
}
.usage-text { color: rgba(255, 255, 255, 0.65); font-size: 13px; white-space: nowrap; }

/* ---------- 分段卡片 ---------- */
.seg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.seg-card {
  background: #fff;
  border: 1px solid var(--pm-border);
  border-top: 3px solid var(--seg-color);
  border-radius: var(--pm-radius);
  box-shadow: var(--pm-shadow);
  padding: 16px 18px 14px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.seg-card:hover { transform: translateY(-2px); box-shadow: var(--pm-shadow-hover); }
.seg-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.seg-title { display: flex; align-items: center; gap: 8px; }
.seg-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--seg-color); box-shadow: 0 0 6px var(--seg-color); }
.seg-label { font-weight: 600; font-size: 14.5px; color: var(--pm-text); }
.seg-cat {
  font-size: 11px;
  color: var(--seg-color);
  background: color-mix(in srgb, var(--seg-color) 10%, #fff);
  padding: 2px 8px;
  border-radius: 5px;
  letter-spacing: 0.5px;
}
.seg-range { color: var(--pm-text-3); font-size: 12.5px; letter-spacing: 0.5px; }
.seg-numbers { display: flex; justify-content: space-between; align-items: baseline; margin: 14px 0 8px; }
.seg-fraction { color: var(--pm-text-2); font-size: 13px; }
.seg-fraction b { font-size: 26px; font-weight: 700; color: var(--pm-text); }
.seg-fraction i { font-style: normal; margin: 0 4px; color: var(--pm-text-3); }
.seg-percent { font-size: 13px; font-weight: 600; color: var(--seg-color); }
.seg-track {
  height: 6px;
  background: #eef0f4;
  border-radius: 999px;
  overflow: hidden;
}
.seg-fill {
  height: 100%;
  background: var(--seg-color);
  border-radius: 999px;
  transition: width 0.6s ease;
}
.seg-free { margin-top: 8px; font-size: 12px; color: var(--pm-text-2); }
.seg-free b { color: #16a34a; }
.seg-ports { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; min-height: 24px; }
.seg-ports.empty { color: var(--pm-text-3); font-size: 12px; align-items: center; display: flex; }
.used-chip {
  font-size: 11.5px;
  color: var(--pm-text-2);
  background: #f3f4f7;
  border: 1px solid var(--pm-border);
  padding: 2px 7px;
  border-radius: 5px;
}
.more { color: var(--pm-text-3); font-size: 12px; }

/* ---------- 端口检查 ---------- */
.check-card {
  background: #fff;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  box-shadow: var(--pm-shadow);
  padding: 16px 20px;
}
.check-title { font-weight: 600; font-size: 14.5px; margin-bottom: 12px; }
.check-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.check-result { display: flex; gap: 8px; }
.result-badge {
  font-size: 12.5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 500;
}
.result-badge.success { color: #16a34a; background: #ecfdf3; }
.result-badge.warning { color: #b45309; background: #fffaeb; }
.result-badge.danger { color: #dc2626; background: #fef2f2; }
</style>

<template>
  <router-view v-if="$route.path === '/login'" />
  <el-container v-else class="layout">
    <el-aside width="232px" class="aside">
      <div class="logo">
        <span class="logo-mark">
          <i></i><i></i><i></i><i></i>
        </span>
        <div class="logo-text">
          <span class="logo-title">Port Hub</span>
          <span class="logo-sub">项目与端口管理中心</span>
        </div>
      </div>
      <nav class="nav">
        <div class="nav-label">管理</div>
        <router-link to="/projects" class="nav-item" :class="{ active: $route.path === '/projects' }">
          <el-icon :size="17"><Folder /></el-icon><span>项目管理</span>
        </router-link>
        <router-link to="/services" class="nav-item" :class="{ active: $route.path === '/services' }">
          <el-icon :size="17"><Box /></el-icon><span>公共服务</span>
        </router-link>
        <div class="nav-label">系统</div>
        <router-link to="/ports" class="nav-item" :class="{ active: $route.path === '/ports' }">
          <el-icon :size="17"><Connection /></el-icon><span>端口池</span>
        </router-link>
        <router-link to="/settings" class="nav-item" :class="{ active: $route.path === '/settings' }">
          <el-icon :size="17"><Setting /></el-icon><span>分配策略</span>
        </router-link>
      </nav>
      <div class="aside-footer">
        <span class="status-dot"></span>
        <span>服务运行中 · :9000</span>
      </div>
    </el-aside>
    <el-container>
      <el-header class="header" height="64px">
        <div class="header-title">
          <h1>{{ title }}</h1>
          <span class="header-sub">{{ subtitle }}</span>
        </div>
        <div class="header-right">
          <span class="reserved-badge">管理服务端口 <b class="mono">9000</b> · 保留</span>
          <el-dropdown v-if="$route.path !== '/login'" trigger="click" @command="handleAccountCommand">
            <button type="button" class="account-trigger" aria-label="打开管理员菜单">
              <el-icon><UserFilled /></el-icon><span>管理员</span><el-icon class="account-arrow"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <div class="page-container">
          <router-view />
        </div>
      </el-main>
    </el-container>
  </el-container>
  <el-dialog v-model="passwordVisible" title="修改管理员密码" width="420px" :close-on-click-modal="false">
    <el-form :model="passwordForm" label-width="100px">
      <el-form-item label="当前密码"><el-input v-model="passwordForm.currentPassword" type="password" show-password /></el-form-item>
      <el-form-item label="新密码"><el-input v-model="passwordForm.newPassword" type="password" show-password /></el-form-item>
      <el-form-item label="确认新密码"><el-input v-model="passwordForm.confirmPassword" type="password" show-password @keyup.enter="changePassword" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="passwordVisible = false">取消</el-button><el-button type="primary" :loading="passwordLoading" @click="changePassword">保存</el-button></template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Folder, Connection, Setting, Box, UserFilled, ArrowDown } from '@element-plus/icons-vue';
import { api } from './api';
import { ElMessage } from 'element-plus';

const route = useRoute();
const passwordVisible = ref(false);
const passwordLoading = ref(false);
const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
async function logout() { await api.logout(); window.location.assign('/login'); }
function handleAccountCommand(command) {
  if (command === 'password') passwordVisible.value = true;
  if (command === 'logout') logout();
}
async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) return ElMessage.error('两次输入的新密码不一致');
  passwordLoading.value = true;
  try { await api.changePassword(passwordForm.value); ElMessage.success('密码已修改，请重新登录'); passwordVisible.value = false; passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }; window.location.assign('/login'); }
  catch (e) { ElMessage.error(e.message); }
  finally { passwordLoading.value = false; }
}
const title = computed(() => ({
  '/projects': '项目管理',
  '/ports': '端口池总览',
  '/services': '公共服务',
  '/settings': '分配策略与配置'
}[route.path] || ''));
const subtitle = computed(() => ({
  '/projects': '按「项目 → 子项目」层级管理所有应用与模块',
  '/ports': '各端口分段的占用与空闲情况',
  '/services': 'MySQL / Redis / Nacos 等共享服务配置与动态资源分配',
  '/settings': '端口分配策略、分段与保留端口'
}[route.path] || ''));
</script>

<style>
/* ---------- 设计变量 ---------- */
:root {
  --pm-accent: #4f6df5;
  --pm-accent-deep: #3d58d6;
  --pm-bg: #f3f4f7;
  --pm-surface: #ffffff;
  --pm-sidebar: #10141c;
  --pm-sidebar-hover: rgba(255, 255, 255, 0.06);
  --pm-border: #e6e8ee;
  --pm-text: #1c2333;
  --pm-text-2: #5d6b82;
  --pm-text-3: #97a1b3;
  --pm-green: #3ddc97;
  --pm-shadow: 0 1px 2px rgba(28, 35, 51, 0.04), 0 4px 16px rgba(28, 35, 51, 0.06);
  --pm-shadow-hover: 0 2px 4px rgba(28, 35, 51, 0.06), 0 8px 24px rgba(79, 109, 245, 0.12);
  --pm-radius: 12px;

  /* Element Plus 主题覆写 */
  --el-color-primary: var(--pm-accent);
  --el-color-primary-light-3: #7c92f8;
  --el-color-primary-light-5: #a5b4fa;
  --el-color-primary-light-7: #cdd6fc;
  --el-color-primary-light-8: #dfe5fd;
  --el-color-primary-light-9: #eef1fe;
  --el-color-primary-dark-2: var(--pm-accent-deep);
  --el-border-radius-base: 6px;
  --el-border-color: var(--pm-border);
  --el-text-color-primary: var(--pm-text);
  --el-text-color-regular: var(--pm-text-2);
  --el-font-family: 'Outfit', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
body {
  font-family: 'Outfit', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  color: var(--pm-text);
  background: var(--pm-bg);
  -webkit-font-smoothing: antialiased;
  overflow: hidden; /* 页面本身不滚动,滚动发生在组件内部 */
}
.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-variant-numeric: tabular-nums; }

.layout { height: 100%; }

/* ---------- 侧边栏 ---------- */
.aside {
  background: var(--pm-sidebar);
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.04);
}
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.logo-mark {
  width: 34px; height: 34px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 9px;
  flex-shrink: 0;
}
.logo-mark i { border-radius: 2.5px; }
.logo-mark i:nth-child(1) { background: var(--pm-accent); }
.logo-mark i:nth-child(2) { background: var(--pm-green); }
.logo-mark i:nth-child(3) { background: var(--pm-green); }
.logo-mark i:nth-child(4) { background: var(--pm-accent); }
.logo-text { display: flex; flex-direction: column; }
.logo-title { color: #fff; font-weight: 700; font-size: 16px; letter-spacing: 0.2px; }
.logo-sub { color: rgba(255, 255, 255, 0.45); font-size: 11px; margin-top: 1px; }

.nav { flex: 1; padding: 14px 12px; display: flex; flex-direction: column; gap: 2px; }
.nav-label {
  color: rgba(255, 255, 255, 0.35);
  font-size: 11px;
  letter-spacing: 1.5px;
  padding: 14px 10px 6px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  font-size: 14px;
  transition: background 0.2s ease, color 0.2s ease;
}
.nav-item:hover { background: var(--pm-sidebar-hover); color: #fff; }
.nav-item.active {
  background: linear-gradient(90deg, rgba(79, 109, 245, 0.22), rgba(79, 109, 245, 0.08));
  color: #fff;
  box-shadow: inset 2px 0 0 var(--pm-accent);
}

.aside-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
}
.status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--pm-green);
  box-shadow: 0 0 6px var(--pm-green);
}

/* ---------- 顶栏 ---------- */
.header {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--pm-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.header-title h1 { font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
.header-sub { font-size: 12px; color: var(--pm-text-3); }
.reserved-badge {
  font-size: 12px;
  color: var(--pm-text-2);
  background: var(--pm-bg);
  border: 1px solid var(--pm-border);
  padding: 5px 10px;
  border-radius: 999px;
}
.reserved-badge b { color: var(--pm-text); }
.account-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid var(--pm-border);
  border-radius: 999px;
  background: var(--pm-surface);
  color: var(--pm-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.account-trigger:hover { color: var(--pm-text); border-color: var(--pm-accent); }
.account-arrow { margin-left: 2px; font-size: 12px; }

/* ---------- 主区域 ---------- */
.main {
  background: var(--pm-bg);
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.page-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 内容可能超高的页面(端口池/设置)在自身容器内滚动 */
.page-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 8px; }

/* ---------- 通用卡片 ---------- */
.pm-card {
  background: var(--pm-surface);
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  box-shadow: var(--pm-shadow);
}

/* ---------- Element 细节覆写 ---------- */
.el-button { transition: all 0.2s ease; }
.el-button:active { transform: scale(0.97); }
.el-table { --el-table-header-bg-color: #f8f9fb; --el-table-border-color: var(--pm-border); }
.el-table th.el-table__cell { font-weight: 600; color: var(--pm-text-2); font-size: 12px; letter-spacing: 0.3px; }
.el-tag { border-radius: 5px; font-weight: 500; }
.el-dialog { border-radius: 14px; }
.el-dialog__title { font-weight: 600; }
</style>

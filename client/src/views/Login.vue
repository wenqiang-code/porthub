<template>
  <main class="login-page">
    <section class="login-card">
      <div class="brand-mark"><i></i><i></i><i></i><i></i></div>
      <h1>PortHub</h1>
      <p class="subtitle">项目与端口管理中心</p>
      <el-form :model="form" @submit.prevent="submit">
        <el-form-item label="管理员账号">
          <el-input v-model="form.username" autocomplete="username" placeholder="请输入管理员账号" />
        </el-form-item>
        <el-form-item label="管理员密码">
          <el-input v-model="form.password" type="password" show-password autocomplete="current-password" placeholder="请输入管理员密码" @keyup.enter="submit" />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <el-button class="submit" type="primary" native-type="submit" :loading="loading">登录</el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const form = ref({ username: '', password: '' });
const loading = ref(false);
const error = ref('');

async function submit() {
  if (loading.value) return;
  error.value = '';
  loading.value = true;
  try {
    await api.login(form.value);
    router.replace('/projects');
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
</script>

<style scoped>
.login-page { min-height: 100dvh; display: grid; place-items: center; padding: 20px; background: #f3f4f7; }
.login-card { width: min(400px, 100%); padding: 34px 36px 30px; background: #fff; border: 1px solid #e6e8ee; border-radius: 14px; box-shadow: 0 12px 36px rgba(28, 35, 51, .1); }
.brand-mark { width: 38px; height: 38px; display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 5px; margin: 0 auto 12px; background: #10141c; border-radius: 9px; }
.brand-mark i { border-radius: 2px; }.brand-mark i:nth-child(1), .brand-mark i:nth-child(4) { background: #4f6df5; }.brand-mark i:nth-child(2), .brand-mark i:nth-child(3) { background: #3ddc97; }
h1 { margin: 0; text-align: center; font-size: 24px; color: #1c2333; }.subtitle { margin: 4px 0 26px; text-align: center; color: #97a1b3; font-size: 13px; }
.submit { width: 100%; margin-top: 20px; }
</style>

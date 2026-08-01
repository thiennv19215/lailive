<script setup lang="ts">
import { KeyRound, LockKeyhole, Mail, UserRound } from '@lucide/vue';
import { ref } from 'vue';
import { validateRegistration } from '../shared/auth-validation';

const username = ref('');
const email = ref('');
const password = ref('');
const confirmation = ref('');
const referral = ref('');
const error = ref('');
const notice = ref('');

function submit(): void {
  error.value = validateRegistration({
    username: username.value,
    email: email.value,
    password: password.value,
    confirmation: confirmation.value,
  }) ?? '';
  notice.value = '';
  if (error.value) return;

  notice.value = 'Biểu mẫu hợp lệ trong mock mode. Chưa tạo tài khoản hoặc gửi dữ liệu ra ngoài.';
}

function normalizeReferral(): void {
  referral.value = referral.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
}
</script>

<template>
  <main class="login-page register-page">
    <div class="auth-window-titlebar"><span class="broadcast-mark">⌁</span><strong>Live Stream Agent</strong></div>
    <header class="login-brand"><span class="broadcast-mark">⌁</span><strong>Live Stream Agent</strong></header>
    <section class="login-pitch register-pitch">
      <div class="register-orbit"><span /><span /><span /></div>
      <h1>Bắt đầu<br /><em>hoàn toàn miễn phí.</em></h1>
      <p>Tạo tài khoản để trải nghiệm avatar AI, phát live tự động và quản lý đa kênh trong một nơi.</p>
      <div class="register-benefits">
        <span>Avatar AI không cần lên hình</span>
        <span>Phát đa nền tảng cùng lúc</span>
        <span>Tương tác tự động 24/7</span>
      </div>
    </section>
    <form class="login-card register-card" @submit.prevent="submit">
      <h2>Tạo tài khoản</h2>
      <p>Miễn phí · Không cần thẻ tín dụng</p>
      <label>Tên người dùng<div class="login-field"><UserRound :size="17" /><input v-model="username" type="text" autocomplete="username" placeholder="Nhập tên người dùng" /></div></label>
      <label>Email<div class="login-field"><Mail :size="17" /><input v-model="email" type="email" autocomplete="email" placeholder="Nhập email của bạn" /></div></label>
      <label>Mật khẩu<div class="login-field"><LockKeyhole :size="17" /><input v-model="password" type="password" autocomplete="new-password" placeholder="Tối thiểu 6 ký tự" /></div></label>
      <label>Xác nhận mật khẩu<div class="login-field"><LockKeyhole :size="17" /><input v-model="confirmation" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu" /></div></label>
      <label>Mã giới thiệu <span class="optional-label">(tùy chọn)</span><div class="login-field"><KeyRound :size="17" /><input v-model="referral" type="text" autocomplete="off" placeholder="Nhập mã giới thiệu" @input="normalizeReferral" /></div></label>
      <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="register-notice" role="status">{{ notice }}</p>
      <button class="wide-primary" type="submit">Tạo tài khoản</button>
      <RouterLink class="auth-route-link" to="/login">Đăng nhập</RouterLink>
      <small>Phase 1 chỉ kiểm tra UI và validation; không gọi dịch vụ đăng ký.</small>
    </form>
  </main>
</template>

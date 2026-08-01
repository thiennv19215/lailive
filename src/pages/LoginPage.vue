<script setup lang="ts">
import { Eye, EyeOff, LockKeyhole, Mail } from '@lucide/vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { validateLogin } from '../shared/login-validation';

const router = useRouter();
const email = ref('');
const password = ref('');
const remember = ref(false);
const showPassword = ref(false);
const error = ref('');
const notice = ref('');

function submit(): void {
  error.value = validateLogin({ email: email.value, password: password.value }) ?? '';
  notice.value = '';
  if (error.value) return;

  if (email.value.trim().toLowerCase().endsWith('.invalid')) {
    error.value = 'Email hoặc mật khẩu không đúng';
    return;
  }

  void router.push('/');
}

function showUnavailableLegalNotice(label: string): void {
  notice.value = `${label} chưa được kết nối trong Phase 1.`;
  error.value = '';
}
</script>

<template>
  <main class="login-page">
    <div class="auth-window-titlebar"><span class="broadcast-mark">⌁</span><strong>Live Stream Agent</strong></div>
    <header class="login-brand"><span class="broadcast-mark">⌁</span><strong>Live Stream Agent</strong></header>
    <section class="login-pitch">
      <div class="pitch-mark"><span /><span /></div>
      <h1>Phát trực tiếp<br /><em>không cần lên hình.</em></h1>
      <p>Nền tảng Livestream chuyên cho nhà bán hàng — avatar AI, đa cảnh, tương tác tự động và phát trực tiếp đa nền tảng trong một ứng dụng.</p>
      <div class="proof-row"><span />12.483 người dùng đang livestream <b>·</b> ☆&nbsp; 4.9 / 5</div>
    </section>
    <form class="login-card" @submit.prevent="submit">
      <h2>Chào mừng trở lại</h2>
      <p>Đăng nhập để tiếp tục các phiên live của bạn</p>
      <label>Email<div class="login-field"><Mail :size="17" /><input v-model="email" type="email" placeholder="Nhập email của bạn" /></div></label>
      <label>Mật khẩu<div class="login-field"><LockKeyhole :size="17" /><input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Nhập mật khẩu" /><button class="login-password-toggle" type="button" :aria-label="showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" :size="16" /><Eye v-else :size="16" /></button></div></label>
      <label class="remember-row"><input v-model="remember" type="checkbox" />Ghi nhớ tôi</label>
      <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="login-notice" role="status">{{ notice }}</p>
      <button class="wide-primary" type="submit">Đăng nhập</button>
      <RouterLink class="auth-route-link" to="/register">Tạo tài khoản miễn phí</RouterLink>
      <nav class="auth-legal" aria-label="Liên kết hỗ trợ">
        <a href="#" @click.prevent="showUnavailableLegalNotice('Điều khoản')">Điều khoản</a>
        <a href="#" @click.prevent="showUnavailableLegalNotice('Chính sách')">Chính sách</a>
        <a href="#" @click.prevent="showUnavailableLegalNotice('Trợ giúp')">Trợ giúp</a>
      </nav>
      <small>Không có dữ liệu xác thực nào được gửi ra ngoài trong mock mode.</small>
    </form>
  </main>
</template>

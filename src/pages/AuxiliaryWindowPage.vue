<script setup lang="ts">
import { ArrowLeft, CircleAlert, FileText, FolderOpen, QrCode, RotateCcw, X } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  AUXILIARY_WINDOW_META,
  AUXILIARY_WINDOW_NAMES,
  FEEDBACK_CLEAN_PROFILE_STATE,
  GUIDE_CLEAN_PROFILE_STATE,
  MONITOR_CLEAN_PROFILE_STATE,
  PAYMENT_CLEAN_PROFILE_STATE,
  SETUP_CLEAN_PROFILE_STATE,
  USER_CLEAN_PROFILE_STATE,
  type AuxiliaryWindowName,
} from '../shared/contracts/auxiliary-windows';

const route = useRoute();
const logNotice = ref('');
const appVersion = ref('0.0.1');
const userState = ref<'loading' | 'recovery' | 'error'>('loading');
let userRecoveryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
const name = computed<AuxiliaryWindowName>(() => {
  const candidate = String(route.params.windowName ?? 'guide');
  return AUXILIARY_WINDOW_NAMES.includes(candidate as AuxiliaryWindowName)
    ? candidate as AuxiliaryWindowName
    : 'guide';
});
const title = computed(() => AUXILIARY_WINDOW_META[name.value].title);
const usesLightAuxiliaryShell = computed(() => ['guide', 'feedback', 'monitor', 'payment', 'user', 'setup'].includes(name.value));

async function closeWindow(): Promise<void> {
  await globalThis.window.desktopApi.app.requestClose();
}

async function openLogWindow(): Promise<void> {
  await globalThis.window.desktopApi.app.openAuxiliaryWindow('log');
}

function openLogFile(): void {
  logNotice.value = 'Chưa có tệp nhật ký local để mở.';
}

function scheduleUserRecovery(): void {
  if (userRecoveryTimer) globalThis.clearTimeout(userRecoveryTimer);
  userState.value = 'loading';
  userRecoveryTimer = globalThis.setTimeout(() => {
    userState.value = 'recovery';
  }, 900);
}

function showUserError(): void {
  if (userRecoveryTimer) globalThis.clearTimeout(userRecoveryTimer);
  userState.value = 'error';
}

watch(
  () => [name.value, String(route.query.userState ?? '')] as const,
  ([currentName, fixture]) => {
    if (currentName !== 'user') return;
    if (fixture === 'loading' || fixture === 'recovery' || fixture === 'error') {
      if (userRecoveryTimer) globalThis.clearTimeout(userRecoveryTimer);
      userState.value = fixture;
    } else {
      scheduleUserRecovery();
    }
  },
  { immediate: true },
);

onMounted(async () => {
  if (name.value !== 'about') return;
  const info = await globalThis.window.desktopApi.app.getInfo();
  appVersion.value = info.version;
});

onBeforeUnmount(() => {
  if (userRecoveryTimer) globalThis.clearTimeout(userRecoveryTimer);
});
</script>

<template>
  <main class="aux-window" :class="{ 'aux-window--about': name === 'about', 'aux-window--monitor': name === 'monitor', 'aux-window--reference-light': usesLightAuxiliaryShell }">
    <header class="aux-titlebar">
      <span v-if="usesLightAuxiliaryShell" class="aux-titlebar-brand" aria-hidden="true"><i>⌁</i><small>AI Livestream</small></span>
      <strong>{{ title }}</strong>
      <button type="button" aria-label="Đóng" @click="closeWindow"><X :size="16" /></button>
    </header>

    <section class="aux-content">
      <template v-if="name === 'monitor'">
        <button class="aux-refresh" type="button" disabled>Làm mới</button>
        <div class="aux-monitor-loading" role="status" aria-live="polite">
          <span class="aux-spinner" />
          <span>{{ MONITOR_CLEAN_PROFILE_STATE.message }}</span>
        </div>
      </template>

      <template v-else-if="name === 'user'">
        <div v-if="userState === 'loading'" class="aux-user-loading" role="status" aria-live="polite">
          <span class="aux-spinner" />
          <span>{{ USER_CLEAN_PROFILE_STATE.loadingMessage }}</span>
        </div>
        <template v-else>
          <button class="aux-back aux-user-back" type="button" @click="showUserError"><ArrowLeft :size="14" />{{ USER_CLEAN_PROFILE_STATE.recoveryAction }}</button>
          <div v-if="userState === 'error'" class="aux-user-error" role="alert">
            <CircleAlert :size="24" />
            <span>{{ USER_CLEAN_PROFILE_STATE.errorMessage }}</span>
            <button type="button" @click="scheduleUserRecovery"><RotateCcw :size="12" />{{ USER_CLEAN_PROFILE_STATE.refreshAction }}</button>
          </div>
        </template>
      </template>

      <template v-else-if="name === 'about'">
        <div class="about-brand"><span class="broadcast-mark">⌁</span><strong>AI Livestream</strong></div>
        <div class="about-grid">
          <div class="about-row about-version-row"><span>Phiên bản</span><strong>v{{ appVersion }} · Phase 1 dev</strong><label class="about-update"><input type="checkbox" disabled />Tự động kiểm tra cập nhật <small>Đã tắt trong dev</small></label></div>
          <div class="about-row"><span>Trang chính thức</span><button type="button" @click="openLogWindow"><FileText :size="14" />Nhật ký</button></div>
          <div class="about-row"><span>Tuyên bố miễn trách</span><p>Bản dựng local phục vụ phát triển và đối chiếu hành vi. Không chứa mã nguồn, branding hoặc tài sản độc quyền của ứng dụng tham chiếu.</p></div>
          <div class="about-link-placeholders"><span>Github <small>Chưa cấu hình</small></span><span>Gitee <small>Chưa cấu hình</small></span></div>
        </div>
        <footer class="about-footer">© 2026 AI Livestream</footer>
      </template>

      <template v-else-if="name === 'log'">
        <button class="aux-log-open" type="button" @click="openLogFile"><FolderOpen :size="14" />Mở tệp</button>
        <div class="aux-log-empty">Không có tệp nhật ký</div>
        <p v-if="logNotice" class="aux-log-notice" role="status">{{ logNotice }}</p>
      </template>

      <template v-else-if="name === 'guide'">
        <div class="aux-guide-loading" role="status" aria-live="polite"><span class="aux-spinner" /><span>{{ GUIDE_CLEAN_PROFILE_STATE.message }}</span></div>
      </template>

      <template v-else-if="name === 'feedback'">
        <div v-if="FEEDBACK_CLEAN_PROFILE_STATE.empty" class="aux-feedback-empty" aria-label="Trạng thái phản hồi trống" />
      </template>

      <template v-else-if="name === 'setup'">
        <div v-if="SETUP_CLEAN_PROFILE_STATE.empty" class="aux-setup-empty" aria-label="Trạng thái khởi tạo trống"><span /><span /></div>
      </template>

      <template v-else-if="name === 'payment'">
        <div class="aux-payment-state">
          <div class="aux-payment-qr" aria-label="Mã thanh toán chưa khả dụng trong Phase 1" />
          <div class="aux-payment-prompt"><QrCode :size="14" />{{ PAYMENT_CLEAN_PROFILE_STATE.prompt }}</div>
        </div>
      </template>

      <div v-else class="aux-empty-surface" />
    </section>
  </main>
</template>

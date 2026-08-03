<script setup lang="ts">
import { ChevronDown, ChevronRight, ExternalLink, LayoutGrid, LayoutTemplate, LogOut, Plus, Radio, RefreshCw, Settings, ShieldCheck, X } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { AUXILIARY_WINDOW_META, AUXILIARY_WINDOW_NAMES, type AuxiliaryWindowName } from '../shared/contracts/auxiliary-windows';
import type { RecoveryNotice } from '../shared/contracts/diagnostics';

const route = useRoute();
const router = useRouter();
const profileOpen = ref(false);
const displayName = ref('Nhà sáng tạo');
const draftDisplayName = ref(displayName.value);
const profileNotice = ref('');
const auxiliaryMenuOpen = ref(false);
const isDev = import.meta.env.DEV;
const showDevTools = computed(() => isDev && route.query.devtools === '1');
const recoveryNotice = ref<RecoveryNotice | null>(null);
const recoveryNoticeCount = ref(0);
const dismissedRecoveryKey = 'ai-livestream.dismissed-recovery-notices';

onMounted(async () => {
  const snapshot = await globalThis.window.desktopApi.diagnostics.getSnapshot();
  const dismissed = readDismissedRecoveryNotices();
  const visible = snapshot.recoveryNotices.filter((notice) => !dismissed.has(notice.id));
  recoveryNotice.value = visible[0] ?? null;
  recoveryNoticeCount.value = visible.length;
});

function readDismissedRecoveryNotices(): Set<string> {
  try {
    const decoded = JSON.parse(globalThis.sessionStorage.getItem(dismissedRecoveryKey) ?? '[]') as unknown;
    return new Set(Array.isArray(decoded) ? decoded.filter((value): value is string => typeof value === 'string') : []);
  } catch {
    globalThis.sessionStorage.removeItem(dismissedRecoveryKey);
    return new Set();
  }
}

function dismissRecoveryNotice(): void {
  if (!recoveryNotice.value) return;
  const dismissed = readDismissedRecoveryNotices();
  dismissed.add(recoveryNotice.value.id);
  globalThis.sessionStorage.setItem(dismissedRecoveryKey, JSON.stringify([...dismissed]));
  recoveryNotice.value = null;
  recoveryNoticeCount.value = 0;
}

async function openRecoveryDiagnostics(): Promise<void> {
  await router.push('/diagnostics');
}

function openProfile(): void {
  draftDisplayName.value = displayName.value;
  profileOpen.value = true;
}

async function openAuxiliaryWindow(name: AuxiliaryWindowName): Promise<void> {
  const result = await globalThis.window.desktopApi.app.openAuxiliaryWindow(name);
  auxiliaryMenuOpen.value = false;
  profileNotice.value = result.reused
    ? `Đã chuyển tới cửa sổ ${AUXILIARY_WINDOW_META[name].title}.`
    : `Đã mở cửa sổ ${AUXILIARY_WINDOW_META[name].title}.`;
}

function saveProfile(): void {
  const value = draftDisplayName.value.trim();
  if (!value) {
    profileNotice.value = 'Tên hiển thị không được để trống.';
    return;
  }
  displayName.value = value;
  profileOpen.value = false;
  profileNotice.value = 'Đã lưu tên hiển thị.';
}
</script>

<template>
  <div class="app-frame" :class="`app-frame--${String(route.name ?? 'unknown')}`">
    <header class="titlebar">
      <RouterLink class="wordmark" to="/">
        <span class="broadcast-mark">⌁</span>
        <span>Live Stream Agent</span>
      </RouterLink>
      <button class="titlebar-add" type="button" title="Tạo dự án mới" @click="$router.push('/?create=1')">
        <Plus :size="18" />
        <span>Tạo dự án</span>
      </button>
      <div v-if="showDevTools" class="dev-window-tools">
        <button class="dev-badge" type="button" aria-haspopup="menu" :aria-expanded="auxiliaryMenuOpen" @click="auxiliaryMenuOpen = !auxiliaryMenuOpen">DEV <ChevronDown :size="12" /></button>
        <div v-if="auxiliaryMenuOpen" class="aux-launch-menu" role="menu">
          <small>Cửa sổ tham chiếu</small>
          <button v-for="name in AUXILIARY_WINDOW_NAMES" :key="name" type="button" role="menuitem" @click="openAuxiliaryWindow(name)"><span>{{ AUXILIARY_WINDOW_META[name].title }}</span><ExternalLink :size="13" /></button>
        </div>
      </div>
    </header>

    <aside class="sidebar">
      <section class="account-card">
        <button class="account-profile-trigger" type="button" @click="openProfile"><span class="account-avatar">T</span><span class="account-copy"><strong>{{ displayName }}</strong><span>Không gian của bạn</span></span></button>
        <button class="icon-button" type="button" title="Đăng xuất" @click="$router.push('/login')"><LogOut :size="18" /></button>
        <div class="credit-row"><b>Credit</b><strong>8.000</strong><button type="button" title="Làm mới credit"><RefreshCw :size="13" /></button></div>
      </section>

      <p class="nav-section">Sáng Tạo</p>
      <nav class="primary-nav" aria-label="Điều hướng chính">
        <RouterLink to="/" :class="{ active: route.name === 'projects' }"><LayoutGrid :size="20" />Trang chủ</RouterLink>
        <RouterLink to="/templates" :class="{ active: route.name === 'templates' }"><LayoutTemplate :size="20" />Mẫu</RouterLink>
        <RouterLink to="/live-control" :class="{ active: route.name === 'live-control' }"><Radio :size="20" />LIVE CONTROL</RouterLink>
        <RouterLink to="/settings" :class="{ active: route.name === 'settings' }"><Settings :size="20" />Cài đặt</RouterLink>
      </nav>
    </aside>

    <main class="page-stage" :class="{ 'has-recovery-notice': recoveryNotice }">
      <aside v-if="recoveryNotice" :class="`recovery-notice recovery-notice--${recoveryNotice.severity}`" role="status">
        <ShieldCheck :size="18" />
        <div class="recovery-notice-copy">
          <span><strong>{{ recoveryNotice.title }}</strong><small v-if="recoveryNoticeCount > 1">và {{ recoveryNoticeCount - 1 }} thông báo khác</small></span>
          <p>Ứng dụng đã tự xử lý để bạn có thể tiếp tục làm việc.</p>
        </div>
        <button v-if="route.name !== 'diagnostics'" class="recovery-notice-action" type="button" @click="openRecoveryDiagnostics">Xem chi tiết<ChevronRight :size="14" /></button>
        <button class="recovery-notice-close" type="button" aria-label="Đóng thông báo phục hồi" @click="dismissRecoveryNotice"><X :size="15" /></button>
      </aside>
      <div v-if="profileNotice" class="shell-notice">{{ profileNotice }}<button type="button" aria-label="Đóng thông báo" @click="profileNotice = ''"><X :size="13" /></button></div>
      <slot />
    </main>
  </div>

  <div v-if="profileOpen" class="page-dialog-backdrop" @click.self="profileOpen = false">
    <form class="page-dialog profile-dialog" @submit.prevent="saveProfile">
      <header><div><small>Hồ sơ của bạn</small><h2>Thông tin hiển thị</h2><p>Tên này giúp bạn dễ nhận biết không gian làm việc của mình.</p></div><button type="button" aria-label="Đóng" @click="profileOpen = false"><X /></button></header>
      <div class="profile-avatar-row"><span class="account-avatar">T</span><div><strong>{{ displayName }}</strong><small>Thường</small></div></div>
      <div class="profile-fields"><label>Tên hiển thị<input v-model="draftDisplayName" type="text" placeholder="Nhập tên của bạn" /></label><label>Email<input type="text" value="local@studio" readonly /></label><p>Dự án của bạn được lưu an toàn trên thiết bị này.</p></div>
      <footer><button type="button" @click="profileOpen = false">Huỷ</button><button class="dialog-primary" type="submit">Lưu thay đổi</button></footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { onMounted, onUnmounted, ref } from 'vue';
import AppErrorBoundary from '../components/AppErrorBoundary.vue';

const closeDialogOpen = ref(false);
const rememberCloseChoice = ref(false);
let removeCloseListener: (() => void) | null = null;

onMounted(() => {
  removeCloseListener = globalThis.window.desktopApi.app.onCloseRequested(() => {
    closeDialogOpen.value = true;
  });
});

onUnmounted(() => removeCloseListener?.());

async function respondToClose(action: 'cancel' | 'quit'): Promise<void> {
  closeDialogOpen.value = false;
  await globalThis.window.desktopApi.app.respondToClose({
    action,
    remember: rememberCloseChoice.value,
  });
}
</script>

<template>
  <AppErrorBoundary>
    <RouterView />
    <div v-if="closeDialogOpen" class="page-dialog-backdrop">
      <section class="page-dialog quit-dialog" role="dialog" aria-modal="true" aria-labelledby="quit-dialog-title">
        <header><div><small>Gợi ý</small><h2 id="quit-dialog-title">Bạn có chắc muốn thoát không?</h2></div><button type="button" aria-label="Đóng" @click="respondToClose('cancel')"><X /></button></header>
        <label class="remember-close"><input v-model="rememberCloseChoice" type="checkbox" />Ghi nhớ lựa chọn của tôi</label>
        <footer><button class="dialog-primary" type="button" @click="respondToClose('cancel')">Hủy</button><button class="dialog-danger" type="button" @click="respondToClose('quit')">Thoát</button></footer>
      </section>
    </div>
  </AppErrorBoundary>
</template>

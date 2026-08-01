<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';

const failed = ref(false);
const detail = ref('');

onErrorCaptured((error) => {
  failed.value = true;
  detail.value = error instanceof Error ? error.message : String(error);
  return false;
});

function reload(): void {
  globalThis.window.location.reload();
}
</script>

<template>
  <main v-if="failed" class="fatal-state">
    <p class="eyebrow">Không thể hiển thị ứng dụng</p>
    <h1>Đã xảy ra lỗi ở giao diện.</h1>
    <p>{{ detail }}</p>
    <button type="button" @click="reload">Tải lại giao diện</button>
  </main>
  <slot v-else />
</template>

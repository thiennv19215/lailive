<script setup lang="ts">
/* global Blob, URL */
import { Activity, Download, RefreshCw, Search, ShieldCheck, Trash2 } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import type {
  DiagnosticLogEntry,
  DiagnosticLogLevel,
  DiagnosticsSnapshot,
  HealthComponent,
} from '../shared/contracts/diagnostics';

const snapshot = ref<DiagnosticsSnapshot | null>(null);
const logs = ref<DiagnosticLogEntry[]>([]);
const search = ref('');
const level = ref<DiagnosticLogLevel | 'all'>('all');
const loading = ref(false);
const message = ref('');
const clearArmed = ref(false);
const componentLabels: Record<HealthComponent, string> = {
  database: 'Dữ liệu',
  tiktok: 'TikTok Live',
  ai: 'AI',
  tts: 'TTS',
  scene: 'Scene runtime',
  obs: 'OBS',
  shop: 'TikTok Shop',
};
const sourceCount = computed(() => new Set(logs.value.map((entry) => entry.source)).size);

onMounted(() => {
  void refreshDiagnostics();
});

async function refreshDiagnostics(): Promise<void> {
  loading.value = true;
  message.value = '';

  try {
    const query = {
      search: search.value || undefined,
      levels: level.value === 'all' ? undefined : [level.value],
      limit: 500,
    };
    [snapshot.value, logs.value] = await Promise.all([
      globalThis.window.desktopApi.diagnostics.getSnapshot(),
      globalThis.window.desktopApi.diagnostics.listLogs(query),
    ]);
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Không thể tải chẩn đoán hệ thống.';
  } finally {
    loading.value = false;
  }
}

async function exportDiagnostics(): Promise<void> {
  const data = await globalThis.window.desktopApi.diagnostics.exportLogs({
    search: search.value || undefined,
    levels: level.value === 'all' ? undefined : [level.value],
    limit: 2000,
  });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = `ai-livestream-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  globalThis.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  message.value = 'Đã xuất bản chẩn đoán đã che dữ liệu nhạy cảm.';
}

async function clearDiagnostics(): Promise<void> {
  if (!clearArmed.value) {
    clearArmed.value = true;
    message.value = 'Nhấn “Xác nhận xóa” để xóa nhật ký chẩn đoán local.';
    return;
  }

  const count = await globalThis.window.desktopApi.diagnostics.clearLogs();
  clearArmed.value = false;
  await refreshDiagnostics();
  message.value = `Đã xóa ${count} mục nhật ký local.`;
}
</script>

<template>
  <AppShell>
    <section class="page-content diagnostics-page">
      <header class="diagnostics-heading">
        <div>
          <small>Phase 12 · local only</small>
          <h1>Chẩn đoán hệ thống</h1>
          <p>Kiểm tra kết nối và nhật ký đã tự động che khóa, cookie, token và nội dung prompt riêng tư.</p>
        </div>
        <button type="button" :disabled="loading" @click="refreshDiagnostics">
          <RefreshCw :size="16" />
          {{ loading ? 'Đang kiểm tra...' : 'Làm mới' }}
        </button>
      </header>

      <div class="health-grid" aria-label="Sức khỏe dịch vụ">
        <article
          v-for="item in snapshot?.health ?? []"
          :key="item.component"
          :class="`health-card health-${item.state}`"
        >
          <span><Activity :size="15" />{{ componentLabels[item.component] }}</span>
          <b>{{ item.state }}</b>
          <strong>{{ item.summary }}</strong>
          <details v-if="item.detail" class="health-technical-detail">
            <summary>Xem chi tiết kỹ thuật</summary>
            <code>{{ item.detail }}</code>
          </details>
        </article>
      </div>

      <section class="diagnostic-log-panel">
        <header>
          <div>
            <ShieldCheck :size="17" />
            <span>
              <strong>Nhật ký đã redaction</strong>
              <small>{{ snapshot?.logCount ?? 0 }} mục · {{ sourceCount }} nguồn</small>
            </span>
          </div>
          <div class="diagnostic-actions">
            <button type="button" @click="exportDiagnostics">
              <Download :size="14" />Xuất JSON
            </button>
            <button type="button" :class="{ danger: clearArmed }" @click="clearDiagnostics">
              <Trash2 :size="14" />{{ clearArmed ? 'Xác nhận xóa' : 'Xóa nhật ký' }}
            </button>
          </div>
        </header>

        <div class="diagnostic-filters">
          <label>
            <Search :size="14" />
            <input
              v-model="search"
              placeholder="Tìm nguồn, thông báo hoặc chi tiết"
              @keyup.enter="refreshDiagnostics"
            />
          </label>
          <select v-model="level" aria-label="Lọc mức nhật ký" @change="refreshDiagnostics">
            <option value="all">Mọi mức</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button type="button" @click="refreshDiagnostics">Áp dụng</button>
        </div>

        <div v-if="logs.length" class="diagnostic-log-list">
          <article v-for="entry in logs" :key="entry.id">
            <time>{{ new Date(entry.timestamp).toLocaleString('vi-VN') }}</time>
            <b :class="`log-${entry.level}`">{{ entry.level }}</b>
            <strong>{{ entry.source }}</strong>
            <p>{{ entry.message }}</p>
            <details v-if="entry.details !== null" class="log-technical-detail">
              <summary>Xem chi tiết kỹ thuật đã che dữ liệu nhạy cảm</summary>
              <pre>{{ JSON.stringify(entry.details, null, 2) }}</pre>
            </details>
          </article>
        </div>
        <div v-else class="diagnostic-empty">
          <ShieldCheck :size="30" />
          <strong>Không có nhật ký phù hợp</strong>
          <p>Thay đổi bộ lọc hoặc vận hành một dịch vụ để tạo chẩn đoán mới.</p>
        </div>
      </section>

      <p v-if="message" class="diagnostic-message" role="status">{{ message }}</p>
    </section>
  </AppShell>
</template>

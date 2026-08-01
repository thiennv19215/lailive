<script setup lang="ts">
import { CheckCircle2, Plus, ShieldCheck, Trash2, X } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { createDefaultGlobalSettings, type GlobalProviderTab, type GlobalSettingsDocument, type SafeProviderAccount } from '../shared/contracts/global-settings';
import { globalSettingsSchema } from '../shared/validation/settings';

const tab = ref<GlobalProviderTab>('grok');
const formOpen = ref(false);
const label = ref('');
const cookieJson = ref('');
const message = ref('');
const veoEnabled = ref(true);
const veoAccountVisible = ref(true);
const grokAccounts = ref<SafeProviderAccount[]>([]);
const loadingSettings = ref(true);
const savingSettings = ref(false);
const settingsError = ref('');

const providerName = computed(() => tab.value === 'grok' ? 'Grok' : 'Veo3');
const providerUrl = computed(() => tab.value === 'grok' ? 'https://grok.com' : 'https://labs.google/fx/tools/flow');

function openForm(): void {
  label.value = '';
  cookieJson.value = '';
  message.value = '';
  formOpen.value = true;
}

function cancelForm(): void {
  formOpen.value = false;
  label.value = '';
  cookieJson.value = '';
}

onMounted(() => { void loadGlobalSettings(); });

function buildGlobalSettings(): GlobalSettingsDocument {
  return globalSettingsSchema.parse({
    schemaVersion: 1,
    activeProvider: tab.value,
    grokAccounts: grokAccounts.value.map((account) => ({ ...account })),
    veoDemo: { visible: veoAccountVisible.value, enabled: veoEnabled.value },
  });
}

function applyGlobalSettings(settings: GlobalSettingsDocument): void {
  tab.value = settings.activeProvider;
  grokAccounts.value = settings.grokAccounts.map((account) => ({ ...account }));
  veoAccountVisible.value = settings.veoDemo.visible;
  veoEnabled.value = settings.veoDemo.enabled;
}

async function loadGlobalSettings(): Promise<void> {
  loadingSettings.value = true;
  settingsError.value = '';
  try {
    const record = await globalThis.window.desktopApi.settings.getGlobal();
    if (!record) {
      const defaults = createDefaultGlobalSettings();
      applyGlobalSettings(defaults);
      await globalThis.window.desktopApi.settings.setGlobal(defaults);
      return;
    }
    applyGlobalSettings(globalSettingsSchema.parse(record.value));
  } catch {
    applyGlobalSettings(createDefaultGlobalSettings());
    settingsError.value = 'Không thể đọc cài đặt đã lưu. Dữ liệu mặc định an toàn đang được dùng.';
  } finally {
    loadingSettings.value = false;
  }
}

async function persistGlobalSettings(): Promise<boolean> {
  savingSettings.value = true;
  settingsError.value = '';
  try {
    await globalThis.window.desktopApi.settings.setGlobal(buildGlobalSettings());
    return true;
  } catch {
    settingsError.value = 'Không thể lưu cài đặt trên thiết bị. Thay đổi vừa rồi chưa được ghi.';
    return false;
  } finally {
    savingSettings.value = false;
  }
}

async function resetGlobalSettings(): Promise<void> {
  applyGlobalSettings(createDefaultGlobalSettings());
  if (await persistGlobalSettings()) message.value = 'Đã khôi phục cài đặt provider mặc định.';
}

async function selectTab(nextTab: GlobalProviderTab): Promise<void> {
  const previous = tab.value;
  tab.value = nextTab;
  formOpen.value = false;
  message.value = '';
  if (!await persistGlobalSettings()) tab.value = previous;
}

async function saveMockCookie(): Promise<void> {
  if (!label.value.trim() || !cookieJson.value.trim()) {
    message.value = 'Nhập đủ nhãn và JSON demo trước khi lưu.';
    return;
  }

  try {
    JSON.parse(cookieJson.value);
  } catch {
    message.value = 'JSON demo không hợp lệ.';
    return;
  }

  if (tab.value === 'grok') {
    grokAccounts.value.push({
      id: `account-${globalThis.crypto.randomUUID()}`,
      label: label.value.trim(),
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    if (!await persistGlobalSettings()) {
      grokAccounts.value.pop();
      return;
    }
  }
  cookieJson.value = '';
  formOpen.value = false;
  message.value = `Đã lưu nhãn cấu hình ${providerName.value}; JSON demo đã bị xóa và không được ghi xuống thiết bị.`;
}

async function removeVeoAccount(): Promise<void> {
  const previous = veoAccountVisible.value;
  veoAccountVisible.value = false;
  if (!await persistGlobalSettings()) {
    veoAccountVisible.value = previous;
    return;
  }
  message.value = 'Đã xóa tài khoản Veo3 mock khỏi cài đặt local.';
}

async function toggleVeoAccount(): Promise<void> {
  const previous = veoEnabled.value;
  veoEnabled.value = !veoEnabled.value;
  if (!await persistGlobalSettings()) {
    veoEnabled.value = previous;
    return;
  }
  message.value = veoEnabled.value ? 'Đã bật lại tài khoản Veo3 mock.' : 'Đã vô hiệu hóa tài khoản Veo3 mock.';
}

async function toggleGrokAccount(account: SafeProviderAccount): Promise<void> {
  const previous = account.enabled;
  account.enabled = !account.enabled;
  if (!await persistGlobalSettings()) account.enabled = previous;
}

async function removeGrokAccount(account: SafeProviderAccount): Promise<void> {
  const index = grokAccounts.value.findIndex((candidate) => candidate.id === account.id);
  if (index < 0) return;
  grokAccounts.value.splice(index, 1);
  if (!await persistGlobalSettings()) grokAccounts.value.splice(index, 0, account);
}
</script>

<template>
  <AppShell>
    <section class="page-content settings-page">
      <h1>Cài đặt</h1>
      <p>Quản lý tài khoản tạo video Grok và Veo3</p>
      <div v-if="settingsError" class="settings-message settings-error" role="alert">{{ settingsError }}<button type="button" @click="resetGlobalSettings">Khôi phục mặc định</button></div>
      <div v-else-if="loadingSettings" class="settings-message" role="status">Đang tải cài đặt local...</div>

      <div class="settings-tabs">
        <button type="button" :class="{ active: tab === 'grok' }" :disabled="loadingSettings || savingSettings" @click="selectTab('grok')">Grok <span>{{ grokAccounts.length }} tài khoản</span></button>
        <button type="button" :class="{ active: tab === 'veo' }" :disabled="loadingSettings || savingSettings" @click="selectTab('veo')">Veo3 <span>{{ veoAccountVisible ? 1 : 0 }} tài khoản</span></button>
      </div>

      <article class="settings-panel provider-panel">
        <div class="provider-heading">
          <div><h2>Cài đặt {{ providerName }}</h2><p>Quản lý cookie tài khoản {{ providerName }} dùng để tạo video avatar.</p></div>
        </div>

        <div class="instruction-box provider-guide">
          <strong>Cách lấy cookie {{ providerName }}</strong>
          <ol><li>Cài đặt tiện ích xuất cookie trên trình duyệt riêng.</li><li>Truy cập <b>{{ providerUrl }}</b> và đăng nhập thủ công.</li><li>Xuất dữ liệu dưới dạng JSON.</li><li>Quay lại đây và dùng bản demo không chứa dữ liệu thật để kiểm tra UI.</li></ol>
          <p><ShieldCheck :size="15" />Chỉ nhãn và trạng thái được lưu local; JSON demo luôn bị xóa và không được gửi ra ngoài.</p>
        </div>

        <button v-if="!formOpen" class="provider-add" type="button" @click="openForm"><Plus :size="16" />Thêm cookie {{ providerName }}</button>

        <form v-if="formOpen" class="cookie-form" @submit.prevent="saveMockCookie">
          <label>Nhãn Cookie<input v-model="label" type="text" placeholder="Ví dụ: Tài Khoản 1, Tài Khoản Kiểm Tra" /></label>
          <label>Giá Trị Cookie<textarea v-model="cookieJson" rows="6" placeholder="Dán JSON demo vào đây" /></label>
          <div><button type="submit" class="save-cookie" :disabled="savingSettings">{{ savingSettings ? 'Đang lưu...' : 'Lưu cấu hình' }}</button><button type="button" @click="cancelForm">Hủy</button></div>
        </form>

        <div v-if="message" class="settings-message"><CheckCircle2 :size="16" />{{ message }}<button type="button" aria-label="Đóng thông báo" @click="message = ''"><X :size="14" /></button></div>
      </article>

      <div v-if="tab === 'grok' && !formOpen && grokAccounts.length === 0" class="provider-empty">Chưa có cookie Grok nào</div>

      <div v-if="tab === 'grok' && !formOpen && grokAccounts.length > 0" class="cookie-table">
        <header><span>Nhãn</span><span>Trạng Thái</span><span>Dùng Chung</span><span>Tạo</span><span>Hành Động</span></header>
        <div v-for="account in grokAccounts" :key="account.id">
          <span><strong>{{ account.label }}</strong><small>✓ Chỉ lưu metadata local</small></span>
          <span class="status-pill" :class="{ disabled: !account.enabled }">{{ account.enabled ? 'Rảnh' : 'Đã tắt' }}</span>
          <span class="scope-pill">Riêng</span>
          <span>{{ new Date(account.createdAt).toLocaleDateString('vi-VN') }}</span>
          <span class="table-actions"><button type="button" :disabled="savingSettings" @click="toggleGrokAccount(account)">{{ account.enabled ? 'Vô Hiệu Hóa' : 'Kích Hoạt' }}</button><button type="button" :disabled="savingSettings" :aria-label="`Xóa ${account.label}`" @click="removeGrokAccount(account)"><Trash2 :size="14" />Xóa</button></span>
        </div>
      </div>

      <div v-if="tab === 'veo' && !formOpen" class="cookie-table">
        <header><span>Nhãn</span><span>Trạng Thái</span><span>Dùng Chung</span><span>Tạo</span><span>Hành Động</span></header>
        <div v-if="veoAccountVisible">
          <span><strong>Veo3 local demo</strong><small>✓ Đang Sử Dụng</small></span>
          <span class="status-pill" :class="{ disabled: !veoEnabled }">{{ veoEnabled ? 'Rảnh' : 'Đã tắt' }}</span>
          <span class="scope-pill">Riêng</span>
          <span>7/29/2026</span>
          <span class="table-actions"><button type="button" :disabled="savingSettings" @click="toggleVeoAccount">{{ veoEnabled ? 'Vô Hiệu Hóa' : 'Kích Hoạt' }}</button><button type="button" :disabled="savingSettings" aria-label="Xóa tài khoản Veo3 mock" @click="removeVeoAccount"><Trash2 :size="14" />Xóa</button></span>
        </div>
        <div v-else class="provider-empty table-empty">Chưa có cookie Veo3 nào</div>
      </div>
    </section>
  </AppShell>
</template>

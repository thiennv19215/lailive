<script setup lang="ts">
/* global Event, HTMLInputElement */
import { ArrowRight, Copy, Download, Ellipsis, Pencil, Plus, Trash2, Upload, UserRound, X } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import beautyCream from '../assets/mock/beauty-cream.jpg';
import templateHost from '../assets/mock/template-host-v2.jpg';
import AppShell from '../components/AppShell.vue';
import PosterCard from '../components/PosterCard.vue';
import type { ProjectPosterPreset, ProjectRecord } from '../shared/contracts/projects';
import { useProjectsStore } from '../stores/projects';

type ProjectTone = 'orange' | 'pink' | 'blue';
type ProjectVariant = 'gold' | 'blossom';

const route = useRoute();
const router = useRouter();
const projectStore = useProjectsStore();
const { projects, loading, saving, error: loadError } = storeToRefs(projectStore);
const createDialogOpen = ref(false);
const projectName = ref('');
const createError = ref('');
const importInput = ref<HTMLInputElement | null>(null);
const deleteTarget = ref<ProjectRecord | null>(null);
const renameTarget = ref<ProjectRecord | null>(null);
const renameName = ref('');
const renameError = ref('');
const notice = ref('');
const activeProjectMenuId = ref<string | null>(null);

onMounted(async () => {
  await projectStore.load().catch(() => undefined);
  if (route.query.create === '1') {
    openCreateDialog();
    void router.replace('/');
  }
});

function openCreateDialog(): void {
  projectName.value = '';
  createError.value = '';
  createDialogOpen.value = true;
}

async function createProject(): Promise<void> {
  const title = projectName.value.trim();
  if (!title) {
    createError.value = 'Nhập tên dự án trước khi tạo.';
    return;
  }

  createError.value = '';
  try {
    await projectStore.create({ title });
    createDialogOpen.value = false;
    notice.value = `Đã tạo và lưu “${title}”.`;
  } catch {
    createError.value = 'Không thể lưu dự án. Vui lòng thử lại.';
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  const removedTitle = deleteTarget.value.title;
  try {
    await projectStore.remove(deleteTarget.value.id);
    deleteTarget.value = null;
    notice.value = `Đã xóa “${removedTitle}”.`;
  } catch {
    notice.value = `Không thể xóa “${removedTitle}”.`;
  }
}

function openRenameDialog(project: ProjectRecord): void {
  renameTarget.value = project;
  renameName.value = project.title;
  renameError.value = '';
}

async function confirmRename(): Promise<void> {
  if (!renameTarget.value) return;
  const title = renameName.value.trim();
  if (!title) {
    renameError.value = 'Nhập tên dự án trước khi lưu.';
    return;
  }
  try {
    const previous = renameTarget.value.title;
    await projectStore.rename(renameTarget.value.id, title);
    renameTarget.value = null;
    notice.value = `Đã đổi tên “${previous}” thành “${title}”.`;
  } catch {
    renameError.value = 'Không thể đổi tên dự án. Vui lòng thử lại.';
  }
}

async function duplicateProject(project: ProjectRecord): Promise<void> {
  try {
    const duplicate = await projectStore.duplicate(project.id);
    notice.value = `Đã nhân bản thành “${duplicate.title}”.`;
  } catch {
    notice.value = `Không thể nhân bản “${project.title}”.`;
  }
}

async function exportProject(project: ProjectRecord): Promise<void> {
  try {
    const data = await projectStore.exportProject(project.id);
    const blob = new globalThis.Blob([data], { type: 'application/json' });
    const url = globalThis.URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'project'}.ailive.json`;
    anchor.click();
    globalThis.URL.revokeObjectURL(url);
    notice.value = `Đã chuẩn bị tệp xuất cho “${project.title}”.`;
  } catch {
    notice.value = `Không thể xuất “${project.title}”.`;
  }
}

async function importProject(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const project = await projectStore.importProject(await file.text());
    createDialogOpen.value = false;
    notice.value = `Đã nhập và lưu “${project.title}”.`;
  } catch {
    createError.value = 'Tệp dự án không hợp lệ hoặc thuộc phiên bản chưa được hỗ trợ.';
  }
}

async function openProject(project: ProjectRecord): Promise<void> {
  try {
    await projectStore.touch(project.id);
  } finally {
    await router.push(`/projects/${project.id}`);
  }
}

function projectVisual(preset: ProjectPosterPreset): { image?: string; tone: ProjectTone; campaign?: string; variant?: ProjectVariant } {
  if (preset === 'gold') return { image: templateHost, tone: 'orange', campaign: 'CHỈ CÓ TRÊN LIVE', variant: 'gold' };
  if (preset === 'blossom') return { image: templateHost, tone: 'pink', campaign: 'ƯU ĐÃI MỪNG TẾT', variant: 'blossom' };
  if (preset === 'product') return { image: beautyCream, tone: 'blue' };
  return { tone: 'blue' };
}

function relativeTime(timestamp: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime());
  if (elapsed < 60_000) return 'Vừa cập nhật';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} phút trước`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} giờ trước`;
  return `${Math.floor(elapsed / 86_400_000)} ngày trước`;
}

function projectStatus(project: ProjectRecord): string {
  if (project.scene.layers.length === 0) return 'Chưa thiết lập';
  if (!project.scene.livestreamSettings.tiktokUsername.trim()) return 'Cần kết nối TikTok';
  return 'Sẵn sàng tiếp tục';
}

function toggleProjectMenu(projectId: string): void {
  activeProjectMenuId.value = activeProjectMenuId.value === projectId ? null : projectId;
}
</script>

<template>
  <AppShell>
    <section class="page-content projects-page">
      <header class="projects-header">
        <div>
          <span class="page-eyebrow">Không gian livestream</span>
          <h1>Dự án của bạn</h1>
          <p>Chọn một dự án để tiếp tục hoặc bắt đầu một livestream mới.</p>
        </div>
        <button class="projects-primary-action" type="button" @click="openCreateDialog"><Plus :size="18" />Tạo dự án mới</button>
      </header>
      <div v-if="notice" class="inline-notice project-notice">{{ notice }}<button type="button" aria-label="Đóng thông báo" @click="notice = ''"><X :size="14" /></button></div>
      <div v-if="loadError" class="inline-notice project-notice" role="alert">{{ loadError }}<button type="button" @click="projectStore.load(true)">Thử lại</button></div>
      <div v-if="loading" class="projects-loading" role="status">Đang tải dự án...</div>
      <div class="project-grid">
        <button class="create-project-card" type="button" @click="openCreateDialog">
          <span><Plus :size="22" /></span>
          <strong>Tạo livestream mới</strong>
          <small>Bắt đầu với hướng dẫn từng bước</small>
        </button>
        <article v-for="project in projects" :key="project.id" class="project-card-wrap">
          <button class="project-button" type="button" @click="openProject(project)">
            <PosterCard v-if="projectVisual(project.posterPreset).image" :title="project.title" :image="projectVisual(project.posterPreset).image!" :tone="projectVisual(project.posterPreset).tone" :campaign="projectVisual(project.posterPreset).campaign" :variant="projectVisual(project.posterPreset).variant" :show-overlay="false" />
            <article v-else class="poster-card project-empty-poster">
              <div class="poster-visual"><UserRound :size="34" /></div>
              <footer><strong>{{ project.title }}</strong></footer>
            </article>
            <span class="project-card-meta"><span class="project-status">{{ projectStatus(project) }}</span><span>{{ relativeTime(project.updatedAt) }}</span></span>
            <span class="project-continue">Tiếp tục <ArrowRight :size="14" /></span>
          </button>
          <button class="project-menu-trigger" type="button" :aria-label="`Tùy chọn cho ${project.title}`" :aria-expanded="activeProjectMenuId === project.id" @click="toggleProjectMenu(project.id)"><Ellipsis :size="18" /></button>
          <div v-if="activeProjectMenuId === project.id" class="project-card-actions" role="menu">
            <button type="button" role="menuitem" @click="activeProjectMenuId = null; openRenameDialog(project)"><Pencil :size="14" />Đổi tên</button>
            <button type="button" role="menuitem" @click="activeProjectMenuId = null; duplicateProject(project)"><Copy :size="14" />Nhân bản</button>
            <button type="button" role="menuitem" @click="activeProjectMenuId = null; exportProject(project)"><Download :size="14" />Xuất dự án</button>
            <button class="project-delete" type="button" role="menuitem" @click="activeProjectMenuId = null; deleteTarget = project"><Trash2 :size="15" />Xóa</button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="createDialogOpen" class="page-dialog-backdrop" @click.self="createDialogOpen = false">
      <form class="page-dialog" @submit.prevent="createProject">
        <header><div><small>Livestream mới</small><h2>Đặt tên cho dự án</h2><p>Bạn có thể thay đổi mọi nội dung sau. Dự án sẽ được tự động lưu.</p></div><button type="button" aria-label="Đóng" @click="createDialogOpen = false"><X /></button></header>
        <label>Tên dự án<input v-model="projectName" autofocus placeholder="Ví dụ: Mỹ phẩm buổi tối" @input="createError = ''" /></label>
        <p v-if="createError" class="dialog-field-error" role="alert">{{ createError }}</p>
        <div class="project-preset"><span>Định dạng video</span><b>Dọc 9:16 · phù hợp TikTok</b></div>
        <input ref="importInput" class="visually-hidden" type="file" accept=".json,application/json" @change="importProject" />
        <footer><button type="button" @click="importInput?.click()"><Upload :size="13" />Nhập dự án</button><button type="button" @click="createDialogOpen = false">Hủy</button><button class="dialog-primary" type="submit" :disabled="saving">{{ saving ? 'Đang lưu...' : 'Tạo dự án' }}</button></footer>
      </form>
    </div>

    <div v-if="renameTarget" class="page-dialog-backdrop" @click.self="renameTarget = null">
      <form class="page-dialog" @submit.prevent="confirmRename">
        <header><div><small>Đổi tên dự án</small><h2>{{ renameTarget.title }}</h2><p>Tên mới được lưu ngay vào dữ liệu dự án local.</p></div><button type="button" aria-label="Đóng" @click="renameTarget = null"><X /></button></header>
        <label>Tên dự án<input v-model="renameName" autofocus maxlength="80" @input="renameError = ''" /></label>
        <p v-if="renameError" class="dialog-field-error" role="alert">{{ renameError }}</p>
        <footer><button type="button" @click="renameTarget = null">Hủy</button><button class="dialog-primary" type="submit" :disabled="saving">{{ saving ? 'Đang lưu...' : 'Lưu tên' }}</button></footer>
      </form>
    </div>

    <div v-if="deleteTarget" class="page-dialog-backdrop" @click.self="deleteTarget = null">
      <section class="page-dialog danger-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
        <header><div><small>Xóa dự án</small><h2 id="delete-project-title">Xóa “{{ deleteTarget.title }}”?</h2><p>Dự án sẽ bị xóa khỏi dữ liệu local trên thiết bị này.</p></div><button type="button" aria-label="Đóng" @click="deleteTarget = null"><X /></button></header>
        <footer><button type="button" @click="deleteTarget = null">Hủy</button><button class="dialog-danger" type="button" :disabled="saving" @click="confirmDelete">{{ saving ? 'Đang xóa...' : 'Xóa dự án' }}</button></footer>
      </section>
    </div>
  </AppShell>
</template>

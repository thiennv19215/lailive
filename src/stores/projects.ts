import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ProjectCreateInput, ProjectRecord, ProjectSceneDocument } from '../shared/contracts/projects';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectRecord[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');

  function sortProjects(): void {
    projects.value.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    loading.value = true;
    error.value = '';
    try {
      projects.value = await globalThis.window.desktopApi.projects.list();
      loaded.value = true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : 'Không thể tải danh sách dự án.';
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: ProjectCreateInput): Promise<ProjectRecord> {
    saving.value = true;
    try {
      const project = await globalThis.window.desktopApi.projects.create(input);
      projects.value.push(project);
      sortProjects();
      return project;
    } finally {
      saving.value = false;
    }
  }

  async function rename(id: string, title: string): Promise<ProjectRecord> {
    saving.value = true;
    try {
      const updated = await globalThis.window.desktopApi.projects.rename(id, title);
      projects.value = projects.value.map((project) => project.id === id ? updated : project);
      sortProjects();
      return updated;
    } finally {
      saving.value = false;
    }
  }

  async function duplicate(id: string): Promise<ProjectRecord> {
    saving.value = true;
    try {
      const project = await globalThis.window.desktopApi.projects.duplicate(id);
      projects.value.push(project);
      sortProjects();
      return project;
    } finally {
      saving.value = false;
    }
  }

  async function remove(id: string): Promise<boolean> {
    saving.value = true;
    try {
      const removed = await globalThis.window.desktopApi.projects.delete(id);
      if (removed) projects.value = projects.value.filter((project) => project.id !== id);
      return removed;
    } finally {
      saving.value = false;
    }
  }

  async function touch(id: string): Promise<ProjectRecord> {
    const updated = await globalThis.window.desktopApi.projects.touch(id);
    projects.value = projects.value.map((project) => project.id === id ? updated : project);
    return updated;
  }

  async function saveScene(id: string, scene: ProjectSceneDocument): Promise<ProjectRecord> {
    const updated = await globalThis.window.desktopApi.projects.saveScene(id, scene);
    projects.value = projects.value.map((project) => project.id === id ? updated : project);
    return updated;
  }

  async function exportProject(id: string): Promise<string> {
    return globalThis.window.desktopApi.projects.export(id);
  }

  async function importProject(data: string): Promise<ProjectRecord> {
    saving.value = true;
    try {
      const project = await globalThis.window.desktopApi.projects.import(data);
      projects.value.push(project);
      sortProjects();
      return project;
    } finally {
      saving.value = false;
    }
  }

  return { projects, loaded, loading, saving, error, load, create, rename, duplicate, remove, touch, saveScene, exportProject, importProject };
});

import { createRouter, createWebHashHistory } from 'vue-router';
import ProjectsPage from '../pages/ProjectsPage.vue';
import ProjectStudioPage from '../pages/ProjectStudioPage.vue';
import LoginPage from '../pages/LoginPage.vue';
import RegisterPage from '../pages/RegisterPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import TemplatesPage from '../pages/TemplatesPage.vue';
import AuxiliaryWindowPage from '../pages/AuxiliaryWindowPage.vue';
import DiagnosticsPage from '../pages/DiagnosticsPage.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'projects', component: ProjectsPage },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/register', name: 'register', component: RegisterPage },
    { path: '/templates', name: 'templates', component: TemplatesPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/diagnostics', name: 'diagnostics', component: DiagnosticsPage },
    { path: '/projects/:projectId', name: 'project-studio', component: ProjectStudioPage },
    { path: '/auxiliary/:windowName', name: 'auxiliary-window', component: AuxiliaryWindowPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

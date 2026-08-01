import type { DesktopApi, SettingRecord } from '../shared/contracts/desktop-api';
import { PROJECT_EXPORT_FORMAT, PROJECT_SCHEMA_VERSION, createDefaultProjects, createEmptyScene, type ProjectRecord } from '../shared/contracts/projects';
import { GLOBAL_SETTINGS_KEY } from '../shared/contracts/global-settings';
import { migrateProjectScene, projectCreateSchema, projectExportEnvelopeSchema, projectIdSchema, projectMediaCheckSchema, projectRecordSchema, projectSceneSchema, projectTitleSchema } from '../shared/validation/projects';
import { globalSettingsSchema } from '../shared/validation/settings';
import { DEFAULT_MOCK_LIVE_EVENTS, LIVE_FIXTURE_FORMAT, LIVE_FIXTURE_VERSION, createDisconnectedLiveSnapshot, createEmptyLiveCounters, type LiveSessionSnapshot, type NormalizedLiveEvent } from '../shared/contracts/live';
import { liveConnectSchema, liveFixtureEnvelopeSchema, liveProbeSchema } from '../shared/validation/live';
import type { AiProviderConfigInput } from '../shared/contracts/ai';
import { aiProviderConfigInputSchema, aiRawGenerateRequestSchema } from '../shared/validation/ai';
import type { TtsProviderConfigInput } from '../shared/contracts/tts';
import { ttsProviderConfigInputSchema, ttsSynthesizeInputSchema } from '../shared/validation/tts';
import type { SceneRuntimeState } from '../shared/contracts/scene-runtime';
import { sceneRuntimePublishSchema } from '../shared/validation/scene-runtime';
import type { ObsConfigInput } from '../shared/contracts/obs';
import { obsConfigInputSchema, obsEnsureOutputSchema } from '../shared/validation/obs';
import type { ShopConfig, ShopProductMapping, ShopScheduleItem, ShopSnapshot } from '../shared/contracts/shop';
import { shopConfigSchema, shopMappingsSchema, shopScheduleSchema } from '../shared/validation/shop';
import type { DiagnosticLogEntry, DiagnosticLogQuery, DiagnosticsSnapshot, RecoveryNotice } from '../shared/contracts/diagnostics';
import { queueDiagnosticEventSchema } from '../shared/validation/diagnostics';

const storagePrefix = 'ai-livestream.dev-setting.';
const projectStorageKey = 'ai-livestream.dev-projects.v1';

function writeProjects(projects: ProjectRecord[]): void {
  globalThis.localStorage.setItem(projectStorageKey, JSON.stringify(projects));
}

function readProjects(): ProjectRecord[] {
  const raw = globalThis.localStorage.getItem(projectStorageKey);
  if (raw) {
    try {
      const decoded = JSON.parse(raw) as Array<Record<string, unknown>>;
      const migrated = decoded.map((project) => ({
        ...project,
        scene: migrateProjectScene(project.scene),
      }));
      const projects = projectRecordSchema.array().parse(migrated);
      writeProjects(projects);
      return projects;
    } catch {
      globalThis.localStorage.removeItem(projectStorageKey);
    }
  }
  const projects = createDefaultProjects();
  writeProjects(projects);
  return projects;
}

function findProject(projects: ProjectRecord[], id: string): ProjectRecord {
  const parsedId = projectIdSchema.parse(id);
  const project = projects.find((candidate) => candidate.id === parsedId);
  if (!project) throw new Error(`Project ${parsedId} was not found.`);
  return project;
}

export function installDevBridge(): void {
  if (!import.meta.env.DEV || globalThis.window.desktopApi) return;

  let liveSnapshot = createDisconnectedLiveSnapshot();
  const liveListeners = new Set<(snapshot: LiveSessionSnapshot) => void>();
  const liveTimers = new Set<ReturnType<typeof globalThis.setTimeout>>();
  const emitLive = (): void => {
    const snapshot = globalThis.structuredClone(liveSnapshot);
    for (const listener of liveListeners) listener(snapshot);
  };
  const pushLiveEvent = (event: NormalizedLiveEvent): void => {
    liveSnapshot.events = [event, ...liveSnapshot.events].slice(0, 200);
    if (event.type === 'chat') liveSnapshot.counters.chat += 1;
    else if (event.type === 'gift') liveSnapshot.counters.gift += 1;
    else if (event.type === 'like') liveSnapshot.counters.like += event.count ?? 1;
    else if (event.type === 'follow') liveSnapshot.counters.follow += 1;
    else if (event.type === 'share') liveSnapshot.counters.share += 1;
    emitLive();
  };
  const stopLiveTimers = (): void => {
    for (const timer of liveTimers) globalThis.clearTimeout(timer);
    liveTimers.clear();
  };
  let aiConfig: AiProviderConfigInput = { kind: 'mock', baseUrl: 'http://127.0.0.1:11434', model: 'mock-livestream-v1' };
  let ttsConfig: TtsProviderConfigInput = { kind: 'mock', endpoint: '', voices: ['Mỹ Dung', 'Minh Anh', 'Ngọc Lam'] };
  const ttsCache = new Set<string>();
  let sceneRuntimeRevision = 0;
  let sceneRuntimeState: SceneRuntimeState | null = null;
  let sceneRuntimeLastPublishedAt: string | null = null;
  let obsConfig: ObsConfigInput = { kind: 'mock', host: '127.0.0.1', port: 4455, sceneName: 'AI Livestream', sourceName: 'AI Livestream Browser', width: 1080, height: 1920, fps: 30 };
  let obsConnected = false;
  let obsBrowserSourceReady = false;
  let obsProgramSceneActive = false;
  let obsVirtualCameraActive = false;
  let shopConfig: ShopConfig = { kind: 'mock', executablePath: '', dashboardUrl: 'https://seller-vn.tiktok.com/compass/live/product' };
  let shopSnapshot: ShopSnapshot = {
    connectionState: 'closed', scheduleState: 'idle', products: [], mappings: [], schedule: [],
    currentScheduleItemId: null, currentScheduleIndex: null, nextActionAt: null, cdpPort: null,
    browserOwned: false, lastError: null, diagnostic: null,
  };
  const shopListeners = new Set<(snapshot: ShopSnapshot) => void>();
  let shopTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  const emitShop = (): void => { for (const listener of shopListeners) listener(globalThis.structuredClone(shopSnapshot)); };
  const clearShopTimer = (): void => { if (shopTimer !== null) globalThis.clearTimeout(shopTimer); shopTimer = null; };
  const stopShopSchedule = (): void => {
    clearShopTimer();
    shopSnapshot = { ...shopSnapshot, scheduleState: 'idle', currentScheduleIndex: null, currentScheduleItemId: null, nextActionAt: null };
    emitShop();
  };
  const runShopScheduleItem = async (): Promise<void> => {
    if (shopSnapshot.scheduleState !== 'running' || shopSnapshot.currentScheduleIndex === null) return;
    const item = shopSnapshot.schedule[shopSnapshot.currentScheduleIndex];
    if (!item) return;
    shopSnapshot.products = shopSnapshot.products.map((product) => ({ ...product, pinned: product.remoteId === item.remoteProductId }));
    shopSnapshot.currentScheduleItemId = item.id;
    shopSnapshot.nextActionAt = new Date(Date.now() + item.durationSeconds * 1000).toISOString();
    emitShop();
    shopTimer = globalThis.setTimeout(() => {
      if (shopSnapshot.scheduleState !== 'running' || shopSnapshot.currentScheduleIndex === null) return;
      shopSnapshot.currentScheduleIndex = (shopSnapshot.currentScheduleIndex + 1) % shopSnapshot.schedule.length;
      void runShopScheduleItem();
    }, item.durationSeconds * 1000);
  };
  let diagnosticLogs: DiagnosticLogEntry[] = [{ id: 'dev-log-start', timestamp: new Date().toISOString(), level: 'info', source: 'app', message: 'Browser development bridge initialized.', details: null }];
  const recoveryFixture = new URLSearchParams(globalThis.location.hash.split('?')[1] ?? '').get('recoveryFixture');
  const recoveryNotices: RecoveryNotice[] = recoveryFixture === 'database'
    ? [{ id: 'dev-recovery-database', kind: 'database-recovered', severity: 'warn', title: 'Đã khôi phục dữ liệu local', message: 'Ứng dụng đã phục hồi bản lưu hoàn chỉnh sau một lần ghi bị gián đoạn.', detail: { source: 'temporary', quarantinedCount: 1 }, occurredAt: new Date().toISOString() }]
    : recoveryFixture === 'stale-lock'
      ? [{ id: 'dev-recovery-stale-lock', kind: 'stale-lock-recovered', severity: 'info', title: 'Đã phục hồi sau lần đóng bất thường', message: 'Khóa phiên cũ đã được cách ly an toàn. Dự án và dịch vụ local có thể tiếp tục.', detail: { runtimeLock: 'replaced-stale' }, occurredAt: new Date().toISOString() }]
      : [];
  const diagnosticHealth = (): DiagnosticsSnapshot => ({
    checkedAt: new Date().toISOString(), recoveryNotices: globalThis.structuredClone(recoveryNotices), logCount: diagnosticLogs.length, logFilePath: 'browser-dev://diagnostics.json',
    health: [
      { component: 'database', state: 'healthy', summary: 'LocalStorage dev sẵn sàng.', detail: null, checkedAt: new Date().toISOString() },
      { component: 'tiktok', state: liveSnapshot.status === 'connected' ? 'healthy' : 'offline', summary: liveSnapshot.status === 'connected' ? 'TikTok mock đã kết nối.' : 'TikTok chưa kết nối.', detail: liveSnapshot.status, checkedAt: new Date().toISOString() },
      { component: 'ai', state: 'healthy', summary: `AI ${aiConfig.kind} đã cấu hình.`, detail: aiConfig.model, checkedAt: new Date().toISOString() },
      { component: 'tts', state: 'healthy', summary: `TTS ${ttsConfig.kind} đã cấu hình.`, detail: ttsConfig.endpoint || null, checkedAt: new Date().toISOString() },
      { component: 'scene', state: 'degraded', summary: 'Scene runtime dùng stub trong browser dev.', detail: null, checkedAt: new Date().toISOString() },
      { component: 'obs', state: obsConnected ? 'healthy' : 'offline', summary: obsConnected ? 'OBS mock đã kết nối.' : 'OBS chưa kết nối.', detail: null, checkedAt: new Date().toISOString() },
      { component: 'shop', state: shopSnapshot.connectionState === 'ready' ? 'healthy' : 'offline', summary: shopSnapshot.connectionState === 'ready' ? 'Shop mock sẵn sàng.' : 'Shop chưa sẵn sàng.', detail: shopSnapshot.connectionState, checkedAt: new Date().toISOString() },
    ],
  });
  const filterDiagnosticLogs = (query: DiagnosticLogQuery = {}): DiagnosticLogEntry[] => {
    const search = query.search?.trim().toLocaleLowerCase('vi-VN');
    return diagnosticLogs.filter((entry) => !query.levels?.length || query.levels.includes(entry.level))
      .filter((entry) => !query.sources?.length || query.sources.includes(entry.source))
      .filter((entry) => !search || `${entry.source} ${entry.message}`.toLocaleLowerCase('vi-VN').includes(search))
      .slice(-(query.limit ?? 500)).reverse().map((entry) => globalThis.structuredClone(entry));
  };

  const api: DesktopApi = {
    app: {
      getInfo: async () => ({
        version: '0.0.1-dev',
        platform: 'win32',
        databasePath: 'browser-dev://local-storage',
      }),
      rendererReady: async () => true,
      onCloseRequested: () => () => undefined,
      requestClose: async () => true,
      respondToClose: async () => true,
      openAuxiliaryWindow: async (name) => {
        globalThis.location.hash = `/auxiliary/${name}`;
        return { name, reused: false };
      },
    },
    settings: {
      get: async <T>(key: string): Promise<SettingRecord<T> | null> => {
        const raw = globalThis.localStorage.getItem(`${storagePrefix}${key}`);
        return raw ? JSON.parse(raw) as SettingRecord<T> : null;
      },
      set: async (key, value) => {
        if (key === GLOBAL_SETTINGS_KEY) throw new Error('Use the typed global settings method.');
        const record = { key, value, updatedAt: new Date().toISOString() };
        globalThis.localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify(record));
        return record;
      },
      getGlobal: async () => {
        const raw = globalThis.localStorage.getItem(`${storagePrefix}${GLOBAL_SETTINGS_KEY}`);
        if (!raw) return null;
        const record = JSON.parse(raw) as SettingRecord<unknown>;
        return { ...record, value: globalSettingsSchema.parse(record.value) };
      },
      setGlobal: async (value) => {
        const record = { key: GLOBAL_SETTINGS_KEY, value: globalSettingsSchema.parse(value), updatedAt: new Date().toISOString() };
        globalThis.localStorage.setItem(`${storagePrefix}${GLOBAL_SETTINGS_KEY}`, JSON.stringify(record));
        return record;
      },
    },
    projects: {
      list: async () => readProjects().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      get: async (id) => readProjects().find((project) => project.id === projectIdSchema.parse(id)) ?? null,
      create: async (input) => {
        const parsed = projectCreateSchema.parse(input);
        const timestamp = new Date().toISOString();
        const project: ProjectRecord = {
          id: `project-${globalThis.crypto.randomUUID()}`,
          title: parsed.title,
          posterPreset: parsed.posterPreset ?? 'product',
          scene: createEmptyScene(),
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOpenedAt: null,
        };
        const projects = readProjects();
        projects.push(project);
        writeProjects(projects);
        return project;
      },
      rename: async (id, title) => {
        const projects = readProjects();
        const project = findProject(projects, id);
        project.title = projectTitleSchema.parse(title);
        project.updatedAt = new Date().toISOString();
        writeProjects(projects);
        return projectRecordSchema.parse(project);
      },
      duplicate: async (id) => {
        const projects = readProjects();
        const source = findProject(projects, id);
        const timestamp = new Date().toISOString();
        const project = projectRecordSchema.parse({
          ...structuredClone(source),
          id: `project-${globalThis.crypto.randomUUID()}`,
          title: `${source.title.slice(0, 69)} (bản sao)`,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOpenedAt: null,
        });
        projects.push(project);
        writeProjects(projects);
        return project;
      },
      touch: async (id) => {
        const projects = readProjects();
        const project = findProject(projects, id);
        project.lastOpenedAt = new Date().toISOString();
        writeProjects(projects);
        return projectRecordSchema.parse(project);
      },
      saveScene: async (id, scene) => {
        const projects = readProjects();
        const project = findProject(projects, id);
        project.scene = projectSceneSchema.parse(scene);
        project.updatedAt = new Date().toISOString();
        writeProjects(projects);
        return projectRecordSchema.parse(project);
      },
      export: async (id) => {
        const project = findProject(readProjects(), id);
        return JSON.stringify({
          format: PROJECT_EXPORT_FORMAT,
          version: PROJECT_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          project,
        }, null, 2);
      },
      import: async (data) => {
        const envelope = projectExportEnvelopeSchema.parse(JSON.parse(data));
        const timestamp = new Date().toISOString();
        const project = projectRecordSchema.parse({
          ...envelope.project,
          id: `project-${globalThis.crypto.randomUUID()}`,
          title: `${envelope.project.title.slice(0, 67)} (nhập)`,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOpenedAt: null,
        });
        const projects = readProjects();
        projects.push(project);
        writeProjects(projects);
        return project;
      },
      delete: async (id) => {
        const projects = readProjects();
        const parsedId = projectIdSchema.parse(id);
        const filtered = projects.filter((project) => project.id !== parsedId);
        if (filtered.length === projects.length) return false;
        writeProjects(filtered);
        return true;
      },
    },
    media: {
      check: async (references) => projectMediaCheckSchema.parse({ references }).references.map((reference) => ({ ...reference, exists: false })),
      pick: async () => null,
      read: async () => null,
    },
    live: {
      getSnapshot: async () => globalThis.structuredClone(liveSnapshot),
      probe: async (input) => {
        const parsed = liveProbeSchema.parse(input);
        return {
          ok: true,
          username: parsed.username,
          roomId: `browser-probe-${parsed.username}`,
          message: `Đã kiểm tra định dạng @${parsed.username} trong trình duyệt dev. Mở Electron để thử TikTok thật.`,
        };
      },
      connect: async (input) => {
        const parsed = liveConnectSchema.parse(input);
        stopLiveTimers();
        liveSnapshot = {
          ...createDisconnectedLiveSnapshot(),
          status: 'connected',
          mode: parsed.mode,
          projectId: parsed.projectId,
          username: parsed.username,
          roomId: `browser-mock-${parsed.username}`,
          connectedAt: new Date().toISOString(),
        };
        emitLive();
        if (parsed.mode === 'mock') DEFAULT_MOCK_LIVE_EVENTS.forEach((event, index) => {
          const timer = globalThis.setTimeout(() => {
            liveTimers.delete(timer);
            pushLiveEvent({ ...event, id: `${event.id}-${Date.now()}` });
          }, 120 * (index + 1));
          liveTimers.add(timer);
        });
        return globalThis.structuredClone(liveSnapshot);
      },
      reconnect: async () => {
        if (!liveSnapshot.projectId || !liveSnapshot.mode || !liveSnapshot.username) throw new Error('No previous live session is available.');
        return api.live.connect({ projectId: liveSnapshot.projectId, mode: liveSnapshot.mode, username: liveSnapshot.username });
      },
      disconnect: async () => {
        stopLiveTimers();
        liveSnapshot.status = 'disconnected';
        liveSnapshot.roomId = null;
        liveSnapshot.connectedAt = null;
        emitLive();
        return globalThis.structuredClone(liveSnapshot);
      },
      clear: async () => {
        liveSnapshot.events = [];
        liveSnapshot.counters = createEmptyLiveCounters();
        emitLive();
        return globalThis.structuredClone(liveSnapshot);
      },
      getRecording: async () => ({
        format: LIVE_FIXTURE_FORMAT,
        version: LIVE_FIXTURE_VERSION,
        recordedAt: new Date().toISOString(),
        events: liveSnapshot.events.map((event) => ({ ...event })),
      }),
      replay: async (fixture) => {
        const parsed = liveFixtureEnvelopeSchema.parse(fixture);
        for (const event of parsed.events) pushLiveEvent({ ...event, id: `replay-${event.id}-${Date.now()}`, source: 'mock' });
        return globalThis.structuredClone(liveSnapshot);
      },
      onSnapshot: (listener) => {
        liveListeners.add(listener);
        listener(globalThis.structuredClone(liveSnapshot));
        return () => liveListeners.delete(listener);
      },
    },
    ai: {
      getConfig: async () => ({ kind: aiConfig.kind, baseUrl: aiConfig.baseUrl, model: aiConfig.model, hasApiKey: Boolean(aiConfig.apiKey) }),
      setConfig: async (input) => {
        aiConfig = aiProviderConfigInputSchema.parse(input);
        return { kind: aiConfig.kind, baseUrl: aiConfig.baseUrl, model: aiConfig.model, hasApiKey: Boolean(aiConfig.apiKey) };
      },
      testConnection: async (input) => {
        const config = aiProviderConfigInputSchema.parse(input);
        return config.kind === 'mock'
          ? { ok: true, models: ['mock-livestream-v1'], message: 'Kết nối mock thành công.' }
          : { ok: false, models: [], message: 'Browser dev chỉ kiểm thử provider mock; dùng Electron cho kết nối mạng.' };
      },
      generate: async (input) => {
        const request = aiRawGenerateRequestSchema.parse(input);
        const product = request.userMessage.match(/Tên:\s*([^\n]+)/)?.[1];
        return {
          text: product ? `Dạ, ${product} có thông tin đã lưu trên live. Bạn muốn mình tư vấn thêm nhé?` : 'Cảm ơn bạn đã tương tác, mình sẽ hỗ trợ ngay nhé!',
          provider: 'mock' as const,
          model: 'mock-livestream-v1',
          attempts: 1,
        };
      },
      cancel: async () => false,
      cancelAll: async () => 0,
    },
    tts: {
      getConfig: async () => ({ kind: ttsConfig.kind, endpoint: ttsConfig.endpoint, voices: [...ttsConfig.voices], hasApiKey: Boolean(ttsConfig.apiKey) }),
      setConfig: async (input) => {
        ttsConfig = ttsProviderConfigInputSchema.parse(input);
        return { kind: ttsConfig.kind, endpoint: ttsConfig.endpoint, voices: [...ttsConfig.voices], hasApiKey: Boolean(ttsConfig.apiKey) };
      },
      testConnection: async (input) => {
        const config = ttsProviderConfigInputSchema.parse(input);
        return config.kind === 'http'
          ? { ok: false, voices: config.voices, message: 'Browser dev chỉ kiểm thử TTS mock/Windows; dùng Electron cho HTTP.' }
          : { ok: true, voices: config.voices, message: config.kind === 'mock' ? 'TTS mock local sẵn sàng.' : 'Windows speech sẵn sàng.' };
      },
      synthesize: async (input) => {
        const request = ttsSynthesizeInputSchema.parse(input);
        const key = `${ttsConfig.kind}:${request.voice}:${request.speed}:${request.text}`;
        const cached = ttsCache.has(key);
        ttsCache.add(key);
        return {
          requestId: request.requestId, provider: ttsConfig.kind, transport: ttsConfig.kind === 'windows-speech' ? 'speech-synthesis' as const : 'mock' as const,
          text: request.text, voice: request.voice, durationMs: Math.min(800, Math.max(80, request.text.length * 4)),
          mimeType: null, audioBase64: null, cacheKey: key, cached,
        };
      },
      cancel: async () => false,
      cancelAll: async () => 0,
      clearCache: async () => { const count = ttsCache.size; ttsCache.clear(); return count; },
    },
    sceneRuntime: {
      getStatus: async () => ({
        running: false,
        host: '127.0.0.1',
        port: null,
        url: null,
        revision: sceneRuntimeRevision,
        connectedClients: 0,
        readyClients: 0,
        hasScene: sceneRuntimeState !== null,
        lastPublishedAt: sceneRuntimeLastPublishedAt,
        lastReadyAt: null,
        recentLogs: [],
      }),
      publish: async (scene, avatarState, presentation) => {
        const nextState = globalThis.structuredClone(sceneRuntimePublishSchema.parse({ scene, avatarState, presentation }));
        const sentAt = new Date().toISOString();
        const changedKeys = sceneRuntimeState
          ? [
              ...(sceneRuntimeState.avatarState !== nextState.avatarState ? ['avatarState'] : []),
              ...(JSON.stringify(sceneRuntimeState.presentation) !== JSON.stringify(nextState.presentation) ? ['presentation'] : []),
              ...Object.keys(nextState.scene)
                .filter((key) => JSON.stringify(sceneRuntimeState?.scene[key as keyof typeof nextState.scene]) !== JSON.stringify(nextState.scene[key as keyof typeof nextState.scene]))
                .map((key) => `scene.${key}`),
            ]
          : ['scene', 'avatarState', 'presentation'];
        const event = {
          kind: sceneRuntimeState ? 'patch' as const : 'snapshot' as const,
          revision: ++sceneRuntimeRevision,
          sentAt,
          changedKeys,
          state: nextState,
        };
        sceneRuntimeState = globalThis.structuredClone(nextState);
        sceneRuntimeLastPublishedAt = sentAt;
        return event;
      },
    },
    obs: {
      getConfig: async () => ({ ...obsConfig, hasPassword: Boolean(obsConfig.password) }),
      setConfig: async (input) => {
        const parsed = obsConfigInputSchema.parse(input);
        obsConfig = { ...parsed, password: parsed.password || obsConfig.password };
        return { ...obsConfig, hasPassword: Boolean(obsConfig.password) };
      },
      testConnection: async (input) => {
        obsConfig = obsConfigInputSchema.parse(input);
        obsConnected = obsConfig.kind === 'mock';
        obsBrowserSourceReady = false;
        obsProgramSceneActive = false;
        obsVirtualCameraActive = false;
        return obsConnected
          ? { ok: true, version: 'mock-obs-browser-dev', message: 'OBS mock đã kết nối.' }
          : { ok: false, version: null, message: 'Browser dev chỉ hỗ trợ OBS mock; dùng Electron cho OBS WebSocket.' };
      },
      getStatus: async () => ({ connected: obsConnected, kind: obsConfig.kind, version: obsConnected ? 'mock-obs-browser-dev' : null, sceneName: obsConfig.sceneName, sourceName: obsConfig.sourceName, browserSourceReady: obsBrowserSourceReady, programSceneActive: obsProgramSceneActive, virtualCameraAvailable: obsConnected, virtualCameraActive: obsVirtualCameraActive, virtualCameraOwned: obsVirtualCameraActive, lastError: null }),
      ensureOutput: async (runtimeUrl) => {
        obsEnsureOutputSchema.parse({ runtimeUrl });
        if (!obsConnected) throw new Error('OBS_NOT_CONNECTED');
        const createdSource = !obsBrowserSourceReady;
        obsBrowserSourceReady = true;
        return { ok: true, createdScene: createdSource, createdSource, sceneName: obsConfig.sceneName, sourceName: obsConfig.sourceName, message: createdSource ? 'Đã tạo Browser Source mock.' : 'Đã cập nhật Browser Source mock.' };
      },
      showOutput: async () => {
        if (!obsConnected || !obsBrowserSourceReady) throw new Error('OBS_BROWSER_SOURCE_NOT_READY');
        obsProgramSceneActive = true;
        return api.obs.getStatus();
      },
      hideOutput: async () => {
        obsVirtualCameraActive = false;
        obsProgramSceneActive = false;
        return api.obs.getStatus();
      },
      startVirtualCamera: async () => {
        if (!obsConnected || !obsBrowserSourceReady) throw new Error('OBS_BROWSER_SOURCE_NOT_READY');
        obsProgramSceneActive = true;
        obsVirtualCameraActive = true;
        return api.obs.getStatus();
      },
      stopVirtualCamera: async () => {
        obsVirtualCameraActive = false;
        return api.obs.getStatus();
      },
      disconnect: async () => {
        obsConnected = false;
        obsBrowserSourceReady = false;
        obsProgramSceneActive = false;
        obsVirtualCameraActive = false;
        return api.obs.getStatus();
      },
    },
    shop: {
      getConfig: async () => globalThis.structuredClone(shopConfig),
      setConfig: async (input) => { shopConfig = shopConfigSchema.parse(input); return globalThis.structuredClone(shopConfig); },
      detectBrowsers: async () => [],
      getSnapshot: async () => globalThis.structuredClone(shopSnapshot),
      open: async () => {
        clearShopTimer();
        shopSnapshot = {
          ...shopSnapshot,
          connectionState: 'ready', browserOwned: true, cdpPort: 9223, lastError: null, diagnostic: null,
          products: [
            { remoteId: 'mock-serum-m5', title: 'Serum dưỡng ẩm M5', index: 0, pinned: false, imageUrl: null },
            { remoteId: 'mock-kem-cica', title: 'Kem phục hồi Cica', index: 1, pinned: false, imageUrl: null },
            { remoteId: 'mock-son-rose', title: 'Son lì Rose 03', index: 2, pinned: false, imageUrl: null },
          ],
        };
        emitShop();
        return { snapshot: globalThis.structuredClone(shopSnapshot), message: 'TikTok Shop mock đã sẵn sàng.' };
      },
      refreshProducts: async () => ({ snapshot: globalThis.structuredClone(shopSnapshot), message: `Đã tải ${shopSnapshot.products.length} sản phẩm mock.` }),
      setMappings: async (mappings: ShopProductMapping[]) => { shopSnapshot.mappings = shopMappingsSchema.parse(mappings); emitShop(); return globalThis.structuredClone(shopSnapshot); },
      setSchedule: async (schedule: ShopScheduleItem[]) => { stopShopSchedule(); shopSnapshot.schedule = shopScheduleSchema.parse(schedule); emitShop(); return globalThis.structuredClone(shopSnapshot); },
      pinProduct: async (remoteProductId) => {
        if (!shopSnapshot.products.some((product) => product.remoteId === remoteProductId)) throw new Error('SHOP_PRODUCT_NOT_FOUND');
        shopSnapshot.products = shopSnapshot.products.map((product) => ({ ...product, pinned: product.remoteId === remoteProductId })); emitShop();
        return { snapshot: globalThis.structuredClone(shopSnapshot), message: 'Đã ghim đúng sản phẩm mock.' };
      },
      startSchedule: async () => {
        if (!shopSnapshot.schedule.length) throw new Error('SHOP_SCHEDULE_EMPTY');
        clearShopTimer(); shopSnapshot.scheduleState = 'running'; shopSnapshot.currentScheduleIndex = 0; await runShopScheduleItem();
        return { snapshot: globalThis.structuredClone(shopSnapshot), message: 'Lịch ghim mock đã bắt đầu.' };
      },
      pauseSchedule: async () => { clearShopTimer(); shopSnapshot.scheduleState = 'paused'; shopSnapshot.nextActionAt = null; emitShop(); return { snapshot: globalThis.structuredClone(shopSnapshot), message: 'Đã tạm dừng.' }; },
      resumeSchedule: async () => { shopSnapshot.scheduleState = 'running'; await runShopScheduleItem(); return { snapshot: globalThis.structuredClone(shopSnapshot), message: 'Đã tiếp tục.' }; },
      skipScheduleItem: async () => { clearShopTimer(); if (shopSnapshot.currentScheduleIndex !== null && shopSnapshot.schedule.length) shopSnapshot.currentScheduleIndex = (shopSnapshot.currentScheduleIndex + 1) % shopSnapshot.schedule.length; await runShopScheduleItem(); return { snapshot: globalThis.structuredClone(shopSnapshot), message: 'Đã bỏ qua.' }; },
      stopSchedule: async () => { stopShopSchedule(); return { snapshot: globalThis.structuredClone(shopSnapshot), message: 'Đã dừng ngay.' }; },
      disconnect: async () => { stopShopSchedule(); shopSnapshot = { ...shopSnapshot, connectionState: 'closed', browserOwned: false, cdpPort: null, products: [] }; emitShop(); return globalThis.structuredClone(shopSnapshot); },
      onSnapshot: (listener) => { shopListeners.add(listener); listener(globalThis.structuredClone(shopSnapshot)); return () => shopListeners.delete(listener); },
    },
    diagnostics: {
      getSnapshot: async () => diagnosticHealth(),
      listLogs: async (query = {}) => filterDiagnosticLogs(query),
      exportLogs: async (query = {}) => JSON.stringify({ format: 'ai-livestream-diagnostics', version: 1, exportedAt: new Date().toISOString(), health: diagnosticHealth().health, recoveryNotices: globalThis.structuredClone(recoveryNotices), logs: filterDiagnosticLogs({ ...query, limit: query.limit ?? 2000 }) }, null, 2),
      clearLogs: async () => { const count = diagnosticLogs.length; diagnosticLogs = []; return count; },
      recordQueueEvent: async (event) => {
        const parsed = queueDiagnosticEventSchema.parse(event);
        diagnosticLogs.push({ id: `queue-${Date.now()}`, timestamp: new Date().toISOString(), level: parsed.kind === 'job-error' || parsed.kind === 'queue-full' ? 'warn' : 'info', source: 'queue', message: `Queue ${parsed.kind}.`, details: { stage: parsed.stage, count: parsed.count } });
        diagnosticLogs = diagnosticLogs.slice(-2000);
        return true;
      },
    },
  };

  globalThis.window.desktopApi = api;
}

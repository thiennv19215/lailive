import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, shell } from 'electron';
import log from 'electron-log/main';
import { registerIpcHandlers, removeIpcHandlers } from '../ipc/register-ipc';
import { SettingsDatabase } from '../services/database';
import { createAuxiliaryWindowOptions, createMainWindowOptions } from './window-options';
import { IPC_CHANNELS } from '../../src/shared/contracts/ipc-channels';
import type { AuxiliaryWindowName, AuxiliaryWindowOpenResult } from '../../src/shared/contracts/auxiliary-windows';
import { LiveSessionService } from '../services/live-connector';
import { AiProviderService } from '../services/ai-provider';
import { TtsProviderService } from '../services/tts-provider';
import { SceneRuntimeService } from '../services/scene-runtime';
import { ObsService } from '../services/obs';
import { ShopService } from '../services/shop';
import { DiagnosticsService } from '../services/diagnostics';
import { AppResilienceService, type ResilienceStartupReport } from '../services/resilience';
import { LiveStateEngine } from '../services/live-state-engine';
import { PreparedLiveProgramController, type PreparedLiveProgramSnapshot } from '../services/prepared-live-program-controller';
import { createDefaultScenePresentationState, type SceneRuntimeMediaEvent } from '../../src/shared/contracts/scene-runtime';
import type { ProjectSceneDocument, ProjectSceneLayer } from '../../src/shared/contracts/projects';
import { liveStateAudioSeekTime, type LiveRuntimeEvent, type LiveStateMedia, type LiveStateSnapshot } from '../../src/shared/contracts/live-state';

let mainWindow: BrowserWindow | null = null;
let database: SettingsDatabase | null = null;
let aiService: AiProviderService | null = null;
let ttsService: TtsProviderService | null = null;
let sceneRuntimeService: SceneRuntimeService | null = null;
let obsService: ObsService | null = null;
let shopService: ShopService | null = null;
let diagnosticsService: DiagnosticsService | null = null;
let resilienceService: AppResilienceService | null = null;
let liveStateEngine: LiveStateEngine | null = null;
let liveStateScene: ProjectSceneDocument | null = null;
let preparedLiveProgramController: PreparedLiveProgramController | null = null;
let preparedLiveProgramScene: ProjectSceneDocument | null = null;
const removeInternalDiagnostics: (() => void)[] = [];
const liveService = new LiveSessionService();
let smokeRendererReady = false;
let allowWindowClose = false;
let closeRequestPending = false;
let shutdownComplete = false;
let shutdownPromise: Promise<void> | null = null;
const auxiliaryWindows = new Map<AuxiliaryWindowName, BrowserWindow>();
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const smokeMode = process.argv.includes('--phase0-smoke');
const closeSmokeMode = process.argv.includes('--close-confirmation-smoke');
const auxiliarySmokeMode = process.argv.includes('--auxiliary-window-smoke');
const captureMode = process.argv.includes('--ui-capture');
const sceneRuntimeSmokeMode = process.argv.includes('--scene-runtime-smoke');
// Isolated capture profiles must run alongside the operator's desktop app.
// They never share its user data and exist only for automated verification.
const isolatedCaptureMode = captureMode && Boolean(process.env.AI_LIVESTREAM_SMOKE_DATA_DIR);

function findStateMediaLayer(scene: ProjectSceneDocument, media: LiveStateMedia, expectedKind: 'visual' | 'audio'): ProjectSceneLayer | null {
  return scene.layers.find((layer) => (
    (layer.source.assetId === media.assetId || layer.source.mediaReferenceId === media.assetId)
    && (expectedKind === 'audio' ? layer.kind === 'audio' : layer.kind === 'avatar' || layer.kind === 'video')
  )) ?? null;
}

function stateAudioResumeAtMs(snapshot: LiveStateSnapshot): number {
  return Math.round(liveStateAudioSeekTime(snapshot.definition, snapshot.currentTime) * 1_000);
}

function publishPreparedLiveProgramSnapshot(snapshot: PreparedLiveProgramSnapshot): void {
  if (!preparedLiveProgramScene || !sceneRuntimeService) return;
  const presentation = createDefaultScenePresentationState();
  presentation.playbackRevision = snapshot.revision;
  const visual = snapshot.visualVideoLayerId
    ? preparedLiveProgramScene.layers.find((layer) => layer.id === snapshot.visualVideoLayerId && layer.kind === 'video') ?? null
    : null;
  const activeAudioLayerId = snapshot.cueAudioPlaying ? snapshot.cueAudioLayerId
    : snapshot.baseAudioPlaying ? snapshot.baseAudioLayerId : null;
  const cueAudioLayers = preparedLiveProgramScene.preparedLiveProgram.cues
    .map((cue) => cue.audioLayerId)
    .filter((id): id is string => Boolean(id));
  const managedLayerIds = [visual?.id, snapshot.baseAudioLayerId, ...cueAudioLayers]
    .filter((id): id is string => Boolean(id));
  if (snapshot.enabled && visual) {
    presentation.mode = snapshot.visualPlaying ? 'playing' : 'stopped';
    presentation.activeScriptId = 'prepared-live-program';
    presentation.activeLayerId = visual.id;
    presentation.activeAudioLayerId = activeAudioLayerId;
    presentation.managedLayerIds = [...new Set(managedLayerIds)];
    presentation.activePaused = !snapshot.visualPlaying;
    // The visual program has no ambient soundtrack. Voice tracks are routed
    // through the separately-owned base/cue audio layers.
    presentation.activeMuted = true;
    presentation.activeVolume = 1;
    presentation.activeAudioMuted = false;
    presentation.activeAudioVolume = 1;
    presentation.activeLoop = false;
    presentation.resumeActiveMedia = snapshot.visualPlaying;
    presentation.resumeAtMs = Math.round(snapshot.visualCurrentTime * 1_000);
    const audioTime = snapshot.cueAudioPlaying ? snapshot.cueAudioCurrentTime : snapshot.baseAudioCurrentTime;
    presentation.audioResumeAtMs = audioTime === null ? null : Math.round(audioTime * 1_000);
    presentation.preloadLayerIds = [...new Set([snapshot.baseAudioLayerId, ...cueAudioLayers].filter((id): id is string => Boolean(id)))];
    presentation.preloadLayerId = presentation.preloadLayerIds[0] ?? null;
  }
  try {
    sceneRuntimeService.publish(preparedLiveProgramScene, activeAudioLayerId ? 'talking' : 'idle', presentation);
  } catch (error) {
    diagnosticsService?.recordThrottled('prepared-live-program:scene-publish', 5_000, {
      level: 'error', source: 'prepared-live-program', message: 'Prepared live program could not publish to Scene Runtime.',
      details: { code: error instanceof Error ? error.message : String(error) },
    });
  }
}

function publishLiveStateSnapshot(snapshot: LiveStateSnapshot): void {
  if (!liveStateScene || !sceneRuntimeService) return;
  const presentation = createDefaultScenePresentationState();
  presentation.playbackRevision = snapshot.revision;
  if (snapshot.state !== 'IDLE') {
    const visual = snapshot.definition.avatar ? findStateMediaLayer(liveStateScene, snapshot.definition.avatar, 'visual') : null;
    const audio = snapshot.definition.audio ? findStateMediaLayer(liveStateScene, snapshot.definition.audio, 'audio') : null;
    const nextDefinition = snapshot.definition.nextState ? liveStateScene.stateMachineSettings.definitions[snapshot.definition.nextState] : null;
    const preloadLayers = [
      nextDefinition?.avatar ? findStateMediaLayer(liveStateScene, nextDefinition.avatar, 'visual') : null,
      nextDefinition?.audio ? findStateMediaLayer(liveStateScene, nextDefinition.audio, 'audio') : null,
    ].filter((layer): layer is ProjectSceneLayer => layer !== null);
    presentation.mode = snapshot.mode;
    presentation.activeScriptId = `live-state:${snapshot.state}`;
    presentation.activeLayerId = visual?.id ?? null;
    presentation.activeAudioLayerId = audio?.id ?? null;
    presentation.activeAvatarLayerId = visual?.kind === 'avatar' ? visual.id : null;
    presentation.managedLayerIds = [...new Set([visual?.id, audio?.id, ...preloadLayers.map((layer) => layer.id)].filter((id): id is string => Boolean(id)))];
    presentation.activePaused = snapshot.mode !== 'playing';
    presentation.activeMuted = audio !== null;
    presentation.activeVolume = 1;
    presentation.activeLoop = false;
    presentation.activeAudioMuted = false;
    presentation.activeAudioVolume = 1;
    // The engine initializes a fresh segment at definition.startAt and stores
    // interrupt progress in currentTime. The Browser Source receives its
    // seek hint in milliseconds and waits for seek completion before play.
    presentation.resumeActiveMedia = snapshot.currentTime > 0;
    presentation.resumeAtMs = snapshot.currentTime > 0 ? Math.round(snapshot.currentTime * 1_000) : null;
    presentation.audioResumeAtMs = audio ? stateAudioResumeAtMs(snapshot) : null;
    presentation.preloadLayerId = preloadLayers[0]?.id ?? null;
    presentation.preloadLayerIds = preloadLayers.map((layer) => layer.id);
  }
  try {
    sceneRuntimeService.publish(liveStateScene, snapshot.definition.audio ? 'talking' : 'idle', presentation);
  } catch (error) {
    diagnosticsService?.recordThrottled('live-state:scene-publish', 5_000, {
      level: 'error', source: 'live-state', message: 'State Engine could not publish to Scene Runtime.',
      details: { code: error instanceof Error ? error.message : String(error) },
    });
  }
}

function toLiveRuntimeEvent(event: SceneRuntimeMediaEvent): LiveRuntimeEvent | null {
  if (event.kind === 'seeked') return null;
  if (event.kind === 'error') return { kind: 'error', revision: event.revision, message: event.error ?? 'SCENE_RUNTIME_MEDIA_ERROR', currentTime: event.currentTime ?? undefined };
  if (event.kind === 'ended') return { kind: 'ended', revision: event.revision, currentTime: event.currentTime ?? undefined };
  if (event.kind === 'progress') return { kind: 'progress', revision: event.revision, currentTime: event.currentTime ?? 0 };
  return { kind: 'ready', revision: event.revision };
}

app.setName('AI Livestream');
// Studio playback is operator initiated, but media is mounted asynchronously
// after a native picker closes. Keep local audio from being rejected as autoplay.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if ((smokeMode || closeSmokeMode || auxiliarySmokeMode || captureMode) && process.env.AI_LIVESTREAM_SMOKE_DATA_DIR) {
  app.setPath('userData', process.env.AI_LIVESTREAM_SMOKE_DATA_DIR);
}
const hasSingleInstanceLock = isolatedCaptureMode || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function secureWindowNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    event.preventDefault();
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    log.error('Preload failed', { preloadPath, error });
    diagnosticsService?.record({ level: 'error', source: 'electron', message: 'Preload failed.', details: { preloadPath, error: error.message } });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process exited', details);
    diagnosticsService?.record({ level: 'error', source: 'renderer', message: 'Renderer process exited.', details });
  });
}

async function loadRendererRoute(window: BrowserWindow, route: string): Promise<void> {
  if (process.env.VITE_DEV_SERVER_URL) {
    const target = new URL(process.env.VITE_DEV_SERVER_URL);
    target.hash = route;
    await window.loadURL(target.toString());
    return;
  }
  await window.loadFile(path.join(moduleDirectory, '../dist/index.html'), { hash: route });
}

async function openAuxiliaryWindow(name: AuxiliaryWindowName): Promise<AuxiliaryWindowOpenResult> {
  const existing = auxiliaryWindows.get(name);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { name, reused: true };
  }

  const window = new BrowserWindow(
    createAuxiliaryWindowOptions(path.join(moduleDirectory, 'index.mjs'), name),
  );
  auxiliaryWindows.set(name, window);
  secureWindowNavigation(window);
  window.once('ready-to-show', () => window.show());
  window.once('closed', () => auxiliaryWindows.delete(name));
  await loadRendererRoute(window, `/auxiliary/${name}`);
  return { name, reused: false };
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow(
    createMainWindowOptions(path.join(moduleDirectory, 'index.mjs')),
  );
  if (captureMode) {
    const viewport = process.env.AI_LIVESTREAM_CAPTURE_VIEWPORT?.match(/^(\d{3,4})x(\d{3,4})$/);
    if (viewport) {
      mainWindow.setMinimumSize(320, 320);
      mainWindow.setContentSize(Number(viewport[1]), Number(viewport[2]));
    }
  }

  secureWindowNavigation(mainWindow);
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Renderer document loaded');
    if (smokeMode && smokeRendererReady) app.quit();
  });
  mainWindow.on('close', (event) => {
    if (smokeMode || captureMode || allowWindowClose) return;
    event.preventDefault();
    if (closeRequestPending) return;
    closeRequestPending = true;
    if (closeSmokeMode) console.log('CLOSE_CONFIRMATION_REQUESTED');
    mainWindow?.webContents.send(IPC_CHANNELS.appCloseRequested);
  });
  mainWindow.once('ready-to-show', () => {
    if (captureMode) mainWindow?.showInactive();
    else mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(moduleDirectory, '../dist/index.html'));
  }
}

async function createSceneRuntimeSmokeWindow(): Promise<void> {
  const runtimeUrl = sceneRuntimeService?.getStatus().url;
  if (!runtimeUrl) throw new Error('Scene runtime URL is unavailable for smoke verification.');
  const window = new BrowserWindow({
    width: 269,
    height: 478,
    useContentSize: true,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on('render-process-gone', (_event, details) => log.error('Scene runtime smoke renderer exited', details));
  await window.loadURL(runtimeUrl);
  window.showInactive();
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  log.initialize();
  log.info('Application starting');
  resilienceService = new AppResilienceService(app.getPath('userData'));
  const resilienceReport: ResilienceStartupReport = await resilienceService.acquire();
  const databasePath = path.join(app.getPath('userData'), 'ai-livestream.db');
  database = await SettingsDatabase.open(databasePath);
  aiService = new AiProviderService(database);
  ttsService = new TtsProviderService(database);
  obsService = new ObsService(database);
  shopService = new ShopService(database, app.getPath('userData'));
  liveStateEngine = new LiveStateEngine();
  preparedLiveProgramController = new PreparedLiveProgramController();
  const appRoot = app.getAppPath();
  sceneRuntimeService = new SceneRuntimeService({
    rendererDirectory: path.join(appRoot, 'scene-runtime'),
    assets: {
      'template-host': path.join(appRoot, 'src/assets/mock/template-host-v2.jpg'),
      'beauty-model': path.join(appRoot, 'src/assets/mock/beauty-model.jpg'),
      'beauty-studio': path.join(appRoot, 'src/assets/mock/beauty-studio.jpg'),
      'beauty-cream': path.join(appRoot, 'src/assets/mock/beauty-cream.jpg'),
      'sticker-freeship': path.join(appRoot, 'src/assets/defaults/sticker-freeship.svg'),
      'sticker-hot-deal': path.join(appRoot, 'src/assets/defaults/sticker-hot-deal.svg'),
      'sticker-live-only': path.join(appRoot, 'src/assets/defaults/sticker-live-only.svg'),
      'sticker-sale-50': path.join(appRoot, 'src/assets/defaults/sticker-sale-50.svg'),
      'background-white-clean': path.join(appRoot, 'src/assets/defaults/background-white-clean.svg'),
      'background-white-warm': path.join(appRoot, 'src/assets/defaults/background-white-warm.svg'),
      'background-white-studio': path.join(appRoot, 'src/assets/defaults/background-white-studio.svg'),
      'flower-video': path.join(appRoot, 'src/assets/mock/flower.mp4'),
      'flower-gif': path.join(appRoot, 'src/assets/mock/flower.gif'),
    },
  });
  await sceneRuntimeService.start();
  diagnosticsService = new DiagnosticsService(path.join(app.getPath('userData'), 'diagnostics.json'), {
    database: () => ({ component: 'database', state: database ? 'healthy' : 'offline', summary: database ? 'SQLite sẵn sàng.' : 'SQLite chưa mở.', detail: database?.path ?? null, checkedAt: '' }),
    tiktok: () => { const status = liveService.getSnapshot().status; return { component: 'tiktok', state: status === 'connected' ? 'healthy' : status === 'error' ? 'error' : 'offline', summary: status === 'connected' ? 'TikTok Live đã kết nối.' : 'TikTok Live chưa kết nối.', detail: status, checkedAt: '' }; },
    ai: () => { const config = aiService?.getConfig(); return { component: 'ai', state: config ? 'healthy' : 'offline', summary: config ? `AI ${config.kind} đã cấu hình.` : 'AI chưa sẵn sàng.', detail: config?.model ?? null, checkedAt: '' }; },
    tts: () => { const config = ttsService?.getConfig(); return { component: 'tts', state: config ? 'healthy' : 'offline', summary: config ? `TTS ${config.kind} đã cấu hình.` : 'TTS chưa sẵn sàng.', detail: config?.endpoint || null, checkedAt: '' }; },
    scene: () => { const status = sceneRuntimeService?.getStatus(); return { component: 'scene', state: status?.running ? 'healthy' : 'error', summary: status?.running ? 'Scene runtime đang chạy.' : 'Scene runtime đã dừng.', detail: status?.url ?? null, checkedAt: '' }; },
    obs: () => { const status = obsService?.getStatus(); return { component: 'obs', state: status?.lastError ? 'error' : status?.connected ? 'healthy' : 'offline', summary: status?.connected ? 'OBS đã kết nối.' : 'OBS chưa kết nối.', detail: status?.lastError ?? status?.version ?? null, checkedAt: '' }; },
    shop: () => { const status = shopService?.getSnapshot(); return { component: 'shop', state: status?.connectionState === 'ready' ? 'healthy' : status?.connectionState === 'error' ? 'error' : 'offline', summary: status?.connectionState === 'ready' ? 'TikTok Shop sẵn sàng.' : 'TikTok Shop chưa sẵn sàng.', detail: status?.lastError ?? status?.connectionState ?? null, checkedAt: '' }; },
  });
  diagnosticsService.record({ level: 'info', source: 'app', message: 'Application services initialized.', details: { version: app.getVersion(), platform: process.platform } });
  const databaseRecovery = database.getRecoveryReport();
  diagnosticsService.record({
    level: databaseRecovery.recovered || databaseRecovery.quarantinedCount > 0 ? 'warn' : 'info',
    source: 'database',
    message: databaseRecovery.recovered ? 'Local database recovery completed.' : 'Local database integrity check completed.',
    details: databaseRecovery,
  });
  diagnosticsService.record({ level: resilienceReport.shopBrowser === 'record-mismatch' ? 'warn' : 'info', source: 'resilience', message: 'Startup recovery checks completed.', details: resilienceReport });
  if (databaseRecovery.recovered) diagnosticsService.addRecoveryNotice({
    kind: 'database-recovered',
    severity: 'warn',
    title: 'Đã khôi phục dữ liệu local',
    message: databaseRecovery.source === 'temporary'
      ? 'Ứng dụng đã phục hồi lần lưu hoàn chỉnh mới nhất sau khi thao tác trước bị gián đoạn.'
      : 'Ứng dụng đã phục hồi bản sao lưu local vì cơ sở dữ liệu chính không còn hợp lệ.',
    detail: databaseRecovery,
  });
  else if (databaseRecovery.quarantinedCount > 0) diagnosticsService.addRecoveryNotice({
    kind: 'database-quarantined', severity: 'warn', title: 'Đã cách ly tệp dữ liệu lỗi',
    message: 'Ứng dụng vẫn mở bằng dữ liệu hợp lệ và đã giữ riêng tệp lỗi để tránh ghi đè.', detail: databaseRecovery,
  });
  if (resilienceReport.runtimeLock === 'replaced-stale') diagnosticsService.addRecoveryNotice({
    kind: 'stale-lock-recovered', severity: 'info', title: 'Đã phục hồi sau lần đóng bất thường',
    message: 'Khóa phiên cũ đã được cách ly an toàn. Dự án và các dịch vụ local có thể tiếp tục.', detail: { runtimeLock: resilienceReport.runtimeLock },
  });
  else if (resilienceReport.runtimeLock === 'replaced-invalid') diagnosticsService.addRecoveryNotice({
    kind: 'invalid-lock-replaced', severity: 'warn', title: 'Đã thay khóa phiên không hợp lệ',
    message: 'Ứng dụng đã tạo khóa phiên mới và không tác động tới tiến trình khác.', detail: { runtimeLock: resilienceReport.runtimeLock },
  });
  if (resilienceReport.shopBrowser === 'terminated-owned-orphan') diagnosticsService.addRecoveryNotice({
    kind: 'shop-orphan-terminated', severity: 'info', title: 'Đã dọn trình duyệt Shop còn sót',
    message: 'Chỉ tiến trình Chrome/Edge thuộc profile riêng của ứng dụng được kết thúc.', detail: { shopBrowser: resilienceReport.shopBrowser },
  });
  else if (resilienceReport.shopBrowser === 'record-mismatch') diagnosticsService.addRecoveryNotice({
    kind: 'shop-owner-mismatch', severity: 'warn', title: 'Không dọn tiến trình Shop chưa xác minh',
    message: 'Thông tin sở hữu không khớp nên ứng dụng giữ nguyên tiến trình và chỉ cách ly owner record.', detail: { shopBrowser: resilienceReport.shopBrowser },
  });
  const initialLiveSnapshot = liveService.getSnapshot();
  let previousLiveStatus = initialLiveSnapshot.status;
  removeInternalDiagnostics.push(liveService.subscribe((snapshot) => {
    if (snapshot.status === previousLiveStatus) return;
    const previous = previousLiveStatus;
    previousLiveStatus = snapshot.status;
    const input = { level: snapshot.status === 'error' ? 'error' as const : 'info' as const, source: 'tiktok', message: 'TikTok Live internal state changed.', details: { previous, current: snapshot.status, code: snapshot.status === 'error' ? snapshot.lastError : null } };
    if (snapshot.status === 'error') diagnosticsService?.recordThrottled('tiktok:internal-error', 10_000, input);
    else diagnosticsService?.record(input);
  }));
  const initialShopSnapshot = shopService.getSnapshot();
  let previousShopConnection = initialShopSnapshot.connectionState;
  let previousShopSchedule = initialShopSnapshot.scheduleState;
  let previousShopIndex = initialShopSnapshot.currentScheduleIndex;
  removeInternalDiagnostics.push(shopService.subscribe((snapshot) => {
    if (snapshot.connectionState !== previousShopConnection) {
      const previous = previousShopConnection;
      previousShopConnection = snapshot.connectionState;
      diagnosticsService?.recordThrottled(`shop:connection:${snapshot.connectionState}`, 10_000, { level: snapshot.connectionState === 'error' ? 'error' : 'info', source: 'shop', message: 'TikTok Shop internal connection state changed.', details: { previous, current: snapshot.connectionState, code: snapshot.lastError } });
    }
    if (snapshot.scheduleState !== previousShopSchedule) {
      const previous = previousShopSchedule;
      previousShopSchedule = snapshot.scheduleState;
      diagnosticsService?.record({ level: snapshot.scheduleState === 'error' ? 'error' : 'info', source: 'shop', message: 'TikTok Shop scheduler state changed.', details: { previous, current: snapshot.scheduleState } });
    }
    if (snapshot.currentScheduleIndex !== previousShopIndex) {
      previousShopIndex = snapshot.currentScheduleIndex;
      diagnosticsService?.recordThrottled('shop:schedule-advance', 5_000, { level: 'debug', source: 'shop', message: 'TikTok Shop scheduler advanced.', details: { currentIndex: snapshot.currentScheduleIndex } });
    }
  }));
  const initialSceneStatus = sceneRuntimeService.getStatus();
  let previousSceneRunning = initialSceneStatus.running;
  let previousSceneClients = initialSceneStatus.connectedClients;
  let previousSceneReady = initialSceneStatus.readyClients;
  let previousSceneHasScene = initialSceneStatus.hasScene;
  let previousSceneLogTimestamp = initialSceneStatus.recentLogs.at(-1)?.timestamp ?? null;
  removeInternalDiagnostics.push(sceneRuntimeService.subscribe((status) => {
    if (status.running !== previousSceneRunning) {
      previousSceneRunning = status.running;
      diagnosticsService?.record({ level: status.running ? 'info' : 'warn', source: 'scene', message: status.running ? 'Scene runtime started.' : 'Scene runtime stopped.' });
    }
    if (status.connectedClients !== previousSceneClients || status.readyClients !== previousSceneReady) {
      previousSceneClients = status.connectedClients;
      previousSceneReady = status.readyClients;
      diagnosticsService?.recordThrottled('scene:client-counts', 3_000, { level: 'info', source: 'scene', message: 'Scene runtime client state changed.', details: { connectedClients: status.connectedClients, readyClients: status.readyClients } });
    }
    if (status.hasScene !== previousSceneHasScene) {
      previousSceneHasScene = status.hasScene;
      diagnosticsService?.record({ level: 'info', source: 'scene', message: status.hasScene ? 'Scene runtime received its first scene.' : 'Scene runtime scene state cleared.' });
    }
    const latestLog = status.recentLogs.at(-1);
    if (latestLog && latestLog.timestamp !== previousSceneLogTimestamp) {
      previousSceneLogTimestamp = latestLog.timestamp;
      if (latestLog.level === 'warn' || latestLog.level === 'error') diagnosticsService?.recordThrottled(`scene:browser-${latestLog.level}`, 10_000, { level: latestLog.level, source: 'scene', message: 'Scene browser reported a runtime issue.', details: { browserLevel: latestLog.level } });
    }
  }));
  removeInternalDiagnostics.push(sceneRuntimeService.subscribePlaybackEnded((event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.sceneRuntimePlaybackEnded, event);
  }));
  removeInternalDiagnostics.push(liveStateEngine.subscribe((snapshot) => publishLiveStateSnapshot(snapshot)));
  removeInternalDiagnostics.push(preparedLiveProgramController.subscribe((snapshot) => publishPreparedLiveProgramSnapshot(snapshot)));
  removeInternalDiagnostics.push(sceneRuntimeService.subscribeMediaEvent((event) => {
    const programController = preparedLiveProgramController;
    const program = programController?.snapshot();
    if (preparedLiveProgramScene && program && programController) {
      if (event.revision === program.revision && event.kind === 'progress' && event.layerId === program.visualVideoLayerId && event.currentTime !== null) {
        programController.onVisualProgress(event.revision, event.currentTime);
      } else if (event.revision === program.revision && event.kind === 'ended' && event.layerId === program.cueAudioLayerId) {
        programController.onCueAudioEnded(event.revision);
      }
      return;
    }
    const liveSnapshot = liveStateEngine?.snapshot();
    if (liveStateScene && liveSnapshot) {
      const visual = liveSnapshot.definition.avatar
        ? findStateMediaLayer(liveStateScene, liveSnapshot.definition.avatar, 'visual')
        : null;
      const audio = liveSnapshot.definition.audio
        ? findStateMediaLayer(liveStateScene, liveSnapshot.definition.audio, 'audio')
        : null;
      const clockLayerId = visual?.id ?? audio?.id ?? null;
      if (event.layerId !== clockLayerId) return;
    }
    const runtimeEvent = toLiveRuntimeEvent(event);
    if (!runtimeEvent || !liveStateScene || !liveStateEngine) return;
    // Scene Runtime already rejects stale browser callbacks; the engine repeats
    // the revision check so an old media element cannot advance a new state.
    liveStateEngine.onRuntimeEvent(runtimeEvent);
  }));
  allowWindowClose = database.get<boolean>('app.skip-close-confirmation')?.value === true;

  if (smokeMode) {
    database.set('smoke.restart-persistence', 'verified');
    database.close();
    database = await SettingsDatabase.open(databasePath);
    if (database.get<string>('smoke.restart-persistence')?.value !== 'verified') {
      throw new Error('SQLite restart persistence smoke check failed');
    }
  }

  registerIpcHandlers(
    database,
    liveService,
    aiService,
    ttsService,
    sceneRuntimeService,
    obsService,
    shopService,
    diagnosticsService,
    liveStateEngine,
    (_projectId, scene) => {
      if (!liveStateEngine || !preparedLiveProgramController) return { enabled: false, message: 'State Engine is unavailable.' };
      if (scene.preparedLiveProgram.enabled) {
        liveStateScene = null;
        liveStateEngine.play({ type: 'PLAY_STATE', state: 'IDLE' });
        preparedLiveProgramScene = scene;
        preparedLiveProgramController.configure(scene.preparedLiveProgram);
        return { enabled: true, message: null };
      }
      preparedLiveProgramScene = null;
      preparedLiveProgramController.stop();
      if (!scene.stateMachineSettings.enabled) {
        liveStateScene = null;
        liveStateEngine.play({ type: 'PLAY_STATE', state: 'IDLE' });
        return { enabled: false, message: 'State Machine is disabled for this project.' };
      }
      liveStateScene = scene;
      liveStateEngine.configure(scene.stateMachineSettings.definitions);
      publishLiveStateSnapshot(liveStateEngine.snapshot());
      return { enabled: true, message: null };
    },
    (command) => {
      const controller = preparedLiveProgramController;
      if (!controller) return false;
      if (command.state === 'IDLE') { controller.stop(); return true; }
      return controller.playCue(command.state);
    },
    () => {
      log.info('Renderer readiness confirmed');
      if (smokeMode) {
        smokeRendererReady = true;
        console.log('PHASE0_SMOKE_OK');
      }
      if (closeSmokeMode) setTimeout(() => mainWindow?.close(), 100).unref();
    },
    (response) => {
      if (response.action === 'cancel') {
        closeRequestPending = false;
        if (closeSmokeMode) console.log('CLOSE_CONFIRMATION_CANCELLED');
        return;
      }
      if (response.remember) database?.set('app.skip-close-confirmation', true);
      allowWindowClose = true;
      app.quit();
    },
    openAuxiliaryWindow,
  );
  await createWindow();
  if (sceneRuntimeSmokeMode) await createSceneRuntimeSmokeWindow();

  if (smokeMode) {
    setTimeout(() => {
      log.error('Renderer readiness smoke check timed out');
      process.exitCode = 1;
      app.quit();
    }, 15_000).unref();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
}).catch((error: unknown) => {
  log.error('Application failed to start', error);
  resilienceService?.release();
  resilienceService = null;
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  shutdownPromise ??= (async () => {
    removeIpcHandlers();
    for (const remove of removeInternalDiagnostics.splice(0)) remove();
    await liveService.close();
    aiService?.cancelAll();
    aiService = null;
    ttsService?.cancelAll();
    ttsService = null;
    await obsService?.disconnect();
    obsService = null;
    await shopService?.close();
    shopService = null;
    liveStateEngine?.dispose();
    liveStateEngine = null;
    liveStateScene = null;
    preparedLiveProgramController = null;
    preparedLiveProgramScene = null;
    await sceneRuntimeService?.close();
    sceneRuntimeService = null;
    diagnosticsService?.record({ level: 'info', source: 'app', message: 'Application shutdown completed.' });
    const lockReleased = resilienceService?.release() ?? false;
    diagnosticsService?.record({ level: lockReleased ? 'info' : 'warn', source: 'resilience', message: 'Runtime lock release completed.', details: { lockReleased } });
    resilienceService = null;
    diagnosticsService = null;
    database?.close();
    database = null;
    shutdownComplete = true;
    app.quit();
  })();
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught main-process error', error);
  diagnosticsService?.record({ level: 'error', source: 'main', message: 'Uncaught main-process error.', details: error });
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled main-process rejection', reason);
  diagnosticsService?.record({ level: 'error', source: 'main', message: 'Unhandled main-process rejection.', details: reason });
});

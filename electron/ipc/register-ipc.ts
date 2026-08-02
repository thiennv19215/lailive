import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../src/shared/contracts/ipc-channels';
import { globalSettingsSchema, settingKeySchema, settingWriteSchema } from '../../src/shared/validation/settings';
import { liveConnectSchema, liveFixtureEnvelopeSchema, liveProbeSchema } from '../../src/shared/validation/live';
import type { SettingsDatabase } from '../services/database';
import { auxiliaryWindowNameSchema } from '../../src/shared/validation/auxiliary-window';
import type { AuxiliaryWindowName, AuxiliaryWindowOpenResult } from '../../src/shared/contracts/auxiliary-windows';
import { projectCreateSchema, projectIdPayloadSchema, projectImportSchema, projectMediaCheckSchema, projectMediaPickSchema, projectMediaReferenceSchema, projectRenameSchema, projectSceneWriteSchema } from '../../src/shared/validation/projects';
import { convertVideoToGif, inspectMediaReferences, readMediaDataUrl } from '../services/media-files';
import { GLOBAL_SETTINGS_KEY } from '../../src/shared/contracts/global-settings';
import type { LiveSessionService } from '../services/live-connector';
import type { AiProviderService } from '../services/ai-provider';
import { aiProviderConfigInputSchema, aiRawGenerateRequestSchema } from '../../src/shared/validation/ai';
import type { TtsProviderService } from '../services/tts-provider';
import { ttsProviderConfigInputSchema, ttsSynthesizeInputSchema } from '../../src/shared/validation/tts';
import { sceneRuntimePublishSchema } from '../../src/shared/validation/scene-runtime';
import type { SceneRuntimeService } from '../services/scene-runtime';
import type { ObsService } from '../services/obs';
import { obsConfigInputSchema, obsEnsureOutputSchema } from '../../src/shared/validation/obs';
import type { ShopService } from '../services/shop';
import { shopConfigSchema, shopMappingsSchema, shopPinInputSchema, shopScheduleSchema } from '../../src/shared/validation/shop';
import type { DiagnosticsService } from '../services/diagnostics';
import { diagnosticLogQuerySchema, queueDiagnosticEventSchema } from '../../src/shared/validation/diagnostics';

const closeResponseSchema = z.object({
  action: z.enum(['cancel', 'quit']),
  remember: z.boolean(),
});

let removeLiveSubscription: (() => void) | null = null;
let removeShopSubscription: (() => void) | null = null;

async function recordLifecycle<T>(
  diagnostics: DiagnosticsService,
  source: string,
  message: string,
  operation: () => T | Promise<T>,
  options: { details?: Record<string, unknown>; logSuccess?: boolean } = {},
): Promise<T> {
  try {
    const result = await operation();
    if (options.logSuccess !== false) diagnostics.record({ level: 'info', source, message, details: options.details });
    return result;
  } catch (error) {
    diagnostics.record({
      level: 'error',
      source,
      message: `${message} failed.`,
      details: { ...options.details, code: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export function registerIpcHandlers(
  database: SettingsDatabase,
  liveService: LiveSessionService,
  aiService: AiProviderService,
  ttsService: TtsProviderService,
  sceneRuntimeService: SceneRuntimeService,
  obsService: ObsService,
  shopService: ShopService,
  diagnosticsService: DiagnosticsService,
  onRendererReady?: () => void,
  onCloseResponse?: (response: z.infer<typeof closeResponseSchema>) => void,
  onOpenAuxiliaryWindow?: (name: AuxiliaryWindowName) => Promise<AuxiliaryWindowOpenResult>,
): void {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    databasePath: database.path,
  }));

  ipcMain.handle(IPC_CHANNELS.appRendererReady, () => {
    onRendererReady?.();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.appRespondToClose, (_event, payload: unknown) => {
    onCloseResponse?.(closeResponseSchema.parse(payload));
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.appRequestClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.appOpenAuxiliaryWindow, (_event, name: unknown) => {
    if (!onOpenAuxiliaryWindow) throw new Error('Auxiliary window handler is unavailable.');
    return onOpenAuxiliaryWindow(auxiliaryWindowNameSchema.parse(name));
  });

  ipcMain.handle(IPC_CHANNELS.settingsGet, (_event, key: unknown) => {
    return database.get(settingKeySchema.parse(key));
  });

  ipcMain.handle(IPC_CHANNELS.settingsSet, (_event, payload: unknown) => {
    const parsed = settingWriteSchema.parse(payload);
    if (parsed.key === GLOBAL_SETTINGS_KEY) throw new Error('Use the typed global settings channel.');
    return database.set(parsed.key, parsed.value);
  });
  ipcMain.handle(IPC_CHANNELS.settingsGetGlobal, () => {
    const record = database.get<unknown>(GLOBAL_SETTINGS_KEY);
    if (!record) return null;
    return { ...record, value: globalSettingsSchema.parse(record.value) };
  });
  ipcMain.handle(IPC_CHANNELS.settingsSetGlobal, (_event, payload: unknown) => {
    return database.set(GLOBAL_SETTINGS_KEY, globalSettingsSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.projectsList, () => database.listProjects());
  ipcMain.handle(IPC_CHANNELS.projectsGet, (_event, payload: unknown) => {
    return database.getProject(projectIdPayloadSchema.parse(payload).id);
  });
  ipcMain.handle(IPC_CHANNELS.projectsCreate, (_event, payload: unknown) => {
    return database.createProject(projectCreateSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.projectsRename, (_event, payload: unknown) => {
    const parsed = projectRenameSchema.parse(payload);
    return database.renameProject(parsed.id, parsed.title);
  });
  ipcMain.handle(IPC_CHANNELS.projectsDuplicate, (_event, payload: unknown) => {
    return database.duplicateProject(projectIdPayloadSchema.parse(payload).id);
  });
  ipcMain.handle(IPC_CHANNELS.projectsTouch, (_event, payload: unknown) => {
    return database.touchProject(projectIdPayloadSchema.parse(payload).id);
  });
  ipcMain.handle(IPC_CHANNELS.projectsSaveScene, (_event, payload: unknown) => {
    const parsed = projectSceneWriteSchema.parse(payload);
    return database.saveProjectScene(parsed.id, parsed.scene);
  });
  ipcMain.handle(IPC_CHANNELS.projectsExport, (_event, payload: unknown) => {
    return database.exportProject(projectIdPayloadSchema.parse(payload).id);
  });
  ipcMain.handle(IPC_CHANNELS.projectsImport, (_event, payload: unknown) => {
    return database.importProject(projectImportSchema.parse(payload).data);
  });
  ipcMain.handle(IPC_CHANNELS.projectsDelete, (_event, payload: unknown) => {
    return database.deleteProject(projectIdPayloadSchema.parse(payload).id);
  });

  ipcMain.handle(IPC_CHANNELS.mediaCheck, (_event, payload: unknown) => {
    const { references } = projectMediaCheckSchema.parse(payload);
    return inspectMediaReferences(references);
  });
  ipcMain.handle(IPC_CHANNELS.mediaRead, (_event, payload: unknown) => readMediaDataUrl(projectMediaReferenceSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.mediaConvertVideoToGif, (_event, payload: unknown) => convertVideoToGif(projectMediaReferenceSchema.parse(payload), path.join(app.getPath('userData'), 'generated-media')));
  ipcMain.handle(IPC_CHANNELS.mediaPick, async (event, payload: unknown) => {
    const parsed = projectMediaPickSchema.parse(payload);
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const filters = parsed.kind === 'video'
      ? [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'mkv'] }]
      : parsed.kind === 'audio'
        ? [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }]
        : [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }];
    const result = owner
      ? await dialog.showOpenDialog(owner, { properties: ['openFile'], filters })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters });
    if (result.canceled || !result.filePaths[0]) return null;
    const selectedPath = path.resolve(result.filePaths[0]);
    if (!fs.existsSync(selectedPath)) return null;
    return projectMediaReferenceSchema.parse({
      id: `media-${randomUUID()}`,
      // Keep the operator's filename visible in the source list after import.
      label: path.basename(selectedPath),
      kind: parsed.kind,
      path: selectedPath,
    });
  });

  ipcMain.handle(IPC_CHANNELS.liveGetSnapshot, () => liveService.getSnapshot());
  ipcMain.handle(IPC_CHANNELS.liveProbe, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'tiktok', 'TikTok Live room probe completed.', () => liveService.probe(liveProbeSchema.parse(payload))));
  ipcMain.handle(IPC_CHANNELS.liveConnect, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'tiktok', 'TikTok Live connection completed.', () => liveService.connect(liveConnectSchema.parse(payload))));
  ipcMain.handle(IPC_CHANNELS.liveReconnect, () => recordLifecycle(diagnosticsService, 'tiktok', 'TikTok Live reconnection completed.', () => liveService.reconnect()));
  ipcMain.handle(IPC_CHANNELS.liveDisconnect, () => recordLifecycle(diagnosticsService, 'tiktok', 'TikTok Live disconnect completed.', () => liveService.disconnect()));
  ipcMain.handle(IPC_CHANNELS.liveClear, () => liveService.clear());
  ipcMain.handle(IPC_CHANNELS.liveGetRecording, () => liveService.createRecording());
  ipcMain.handle(IPC_CHANNELS.liveReplay, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'tiktok', 'TikTok fixture replay completed.', () => liveService.replay(liveFixtureEnvelopeSchema.parse(payload))));
  removeLiveSubscription?.();
  removeLiveSubscription = liveService.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.liveSnapshot, snapshot);
    }
  });

  ipcMain.handle(IPC_CHANNELS.aiGetConfig, () => aiService.getConfig());
  ipcMain.handle(IPC_CHANNELS.aiSetConfig, (_event, payload: unknown) => aiService.setConfig(aiProviderConfigInputSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.aiTestConnection, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'ai', 'AI connection test completed.', () => aiService.testConnection(aiProviderConfigInputSchema.parse(payload))));
  ipcMain.handle(IPC_CHANNELS.aiGenerate, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'ai', 'AI generation completed.', () => aiService.generate(aiRawGenerateRequestSchema.parse(payload)), { logSuccess: false }));
  ipcMain.handle(IPC_CHANNELS.aiCancel, (_event, requestId: unknown) => aiService.cancel(z.string().trim().min(1).max(120).parse(requestId)));
  ipcMain.handle(IPC_CHANNELS.aiCancelAll, () => aiService.cancelAll());
  ipcMain.handle(IPC_CHANNELS.ttsGetConfig, () => ttsService.getConfig());
  ipcMain.handle(IPC_CHANNELS.ttsSetConfig, (_event, payload: unknown) => ttsService.setConfig(ttsProviderConfigInputSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.ttsTestConnection, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'tts', 'TTS connection test completed.', () => ttsService.testConnection(ttsProviderConfigInputSchema.parse(payload))));
  ipcMain.handle(IPC_CHANNELS.ttsSynthesize, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'tts', 'TTS synthesis completed.', () => ttsService.synthesize(ttsSynthesizeInputSchema.parse(payload)), { logSuccess: false }));
  ipcMain.handle(IPC_CHANNELS.ttsCancel, (_event, requestId: unknown) => ttsService.cancel(z.string().trim().min(1).max(120).parse(requestId)));
  ipcMain.handle(IPC_CHANNELS.ttsCancelAll, () => ttsService.cancelAll());
  ipcMain.handle(IPC_CHANNELS.ttsClearCache, () => ttsService.clearCache());
  ipcMain.handle(IPC_CHANNELS.sceneRuntimeGetStatus, () => sceneRuntimeService.getStatus());
  ipcMain.handle(IPC_CHANNELS.sceneRuntimePublish, (_event, payload: unknown) => {
    const parsed = sceneRuntimePublishSchema.parse(payload);
    return recordLifecycle(diagnosticsService, 'scene', 'Scene publish completed.', () => sceneRuntimeService.publish(parsed.scene, parsed.avatarState, parsed.presentation, parsed.tts), { logSuccess: false });
  });
  sceneRuntimeService.subscribeTts((event) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.sceneRuntimeTtsEvent, event);
  });
  ipcMain.handle(IPC_CHANNELS.obsGetConfig, () => obsService.getConfig());
  ipcMain.handle(IPC_CHANNELS.obsSetConfig, (_event, payload: unknown) => obsService.setConfig(obsConfigInputSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.obsTestConnection, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'obs', 'OBS connection test completed.', () => obsService.testConnection(obsConfigInputSchema.parse(payload))));
  ipcMain.handle(IPC_CHANNELS.obsGetStatus, () => obsService.getStatus());
  ipcMain.handle(IPC_CHANNELS.obsEnsureOutput, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'obs', 'OBS browser output prepared.', () => obsService.ensureOutput(obsEnsureOutputSchema.parse(payload).runtimeUrl)));
  ipcMain.handle(IPC_CHANNELS.obsShowOutput, () => recordLifecycle(diagnosticsService, 'obs', 'OBS program scene activated.', () => obsService.showOutput()));
  ipcMain.handle(IPC_CHANNELS.obsHideOutput, () => recordLifecycle(diagnosticsService, 'obs', 'OBS program scene restored.', () => obsService.hideOutput()));
  ipcMain.handle(IPC_CHANNELS.obsStartVirtualCamera, () => recordLifecycle(diagnosticsService, 'obs', 'OBS virtual camera start completed.', () => obsService.startVirtualCamera()));
  ipcMain.handle(IPC_CHANNELS.obsStopVirtualCamera, () => recordLifecycle(diagnosticsService, 'obs', 'OBS virtual camera stop completed.', () => obsService.stopVirtualCamera()));
  ipcMain.handle(IPC_CHANNELS.obsDisconnect, () => recordLifecycle(diagnosticsService, 'obs', 'OBS disconnect completed.', () => obsService.disconnect()));
  ipcMain.handle(IPC_CHANNELS.shopGetConfig, () => shopService.getConfig());
  ipcMain.handle(IPC_CHANNELS.shopSetConfig, (_event, payload: unknown) => shopService.setConfig(shopConfigSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.shopDetectBrowsers, () => shopService.detectBrowsers());
  ipcMain.handle(IPC_CHANNELS.shopGetSnapshot, () => shopService.getSnapshot());
  ipcMain.handle(IPC_CHANNELS.shopOpen, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop browser open completed.', () => shopService.open()));
  ipcMain.handle(IPC_CHANNELS.shopRefreshProducts, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop product refresh completed.', () => shopService.refreshProducts()));
  ipcMain.handle(IPC_CHANNELS.shopSetMappings, (_event, payload: unknown) => shopService.setMappings(shopMappingsSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.shopSetSchedule, (_event, payload: unknown) => shopService.setSchedule(shopScheduleSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.shopPinProduct, (_event, payload: unknown) => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop pin completed.', () => shopService.pinProduct(shopPinInputSchema.parse(payload).remoteProductId)));
  ipcMain.handle(IPC_CHANNELS.shopStartSchedule, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop schedule started.', () => shopService.startSchedule()));
  ipcMain.handle(IPC_CHANNELS.shopPauseSchedule, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop schedule paused.', () => shopService.pauseSchedule()));
  ipcMain.handle(IPC_CHANNELS.shopResumeSchedule, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop schedule resumed.', () => shopService.resumeSchedule()));
  ipcMain.handle(IPC_CHANNELS.shopSkipScheduleItem, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop schedule item skipped.', () => shopService.skipScheduleItem()));
  ipcMain.handle(IPC_CHANNELS.shopStopSchedule, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop schedule stopped.', () => shopService.stopSchedule()));
  ipcMain.handle(IPC_CHANNELS.shopDisconnect, () => recordLifecycle(diagnosticsService, 'shop', 'TikTok Shop disconnect completed.', () => shopService.disconnect()));
  removeShopSubscription?.();
  removeShopSubscription = shopService.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.shopSnapshot, snapshot);
  });
  ipcMain.handle(IPC_CHANNELS.diagnosticsGetSnapshot, () => diagnosticsService.getSnapshot());
  ipcMain.handle(IPC_CHANNELS.diagnosticsListLogs, (_event, payload: unknown) => diagnosticsService.list(diagnosticLogQuerySchema.parse(payload ?? {})));
  ipcMain.handle(IPC_CHANNELS.diagnosticsExportLogs, (_event, payload: unknown) => diagnosticsService.export(diagnosticLogQuerySchema.parse(payload ?? {})));
  ipcMain.handle(IPC_CHANNELS.diagnosticsClearLogs, () => diagnosticsService.clear());
  ipcMain.handle(IPC_CHANNELS.diagnosticsRecordQueueEvent, (_event, payload: unknown) => {
    const parsed = queueDiagnosticEventSchema.parse(payload);
    const messages = {
      'queue-full': 'Interaction queue rejected an item because it is full.',
      'job-error': 'Interaction queue job failed.',
      'job-cancelled': 'Interaction queue job was cancelled.',
      retry: 'Interaction queue retry requested.',
      cleared: 'Interaction queue cleared.',
    } as const;
    return Boolean(diagnosticsService.recordThrottled(
      `queue:${parsed.kind}:${parsed.stage ?? 'none'}`,
      5_000,
      { level: parsed.kind === 'job-error' || parsed.kind === 'queue-full' ? 'warn' : 'info', source: 'queue', message: messages[parsed.kind], details: { stage: parsed.stage, count: parsed.count } },
    ));
  });
}

export function removeIpcHandlers(): void {
  removeLiveSubscription?.();
  removeLiveSubscription = null;
  removeShopSubscription?.();
  removeShopSubscription = null;
  for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
}

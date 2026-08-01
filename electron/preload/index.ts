import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../../src/shared/contracts/desktop-api';
import { IPC_CHANNELS } from '../../src/shared/contracts/ipc-channels';

const api: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
    rendererReady: () => ipcRenderer.invoke(IPC_CHANNELS.appRendererReady),
    onCloseRequested: (listener) => {
      const handler = (): void => listener();
      ipcRenderer.on(IPC_CHANNELS.appCloseRequested, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.appCloseRequested, handler);
    },
    requestClose: () => ipcRenderer.invoke(IPC_CHANNELS.appRequestClose),
    respondToClose: (response) => ipcRenderer.invoke(IPC_CHANNELS.appRespondToClose, response),
    openAuxiliaryWindow: (name) => ipcRenderer.invoke(IPC_CHANNELS.appOpenAuxiliaryWindow, name),
  },
  settings: {
    get: (key) => ipcRenderer.invoke(IPC_CHANNELS.settingsGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, { key, value }),
    getGlobal: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetGlobal),
    setGlobal: (value) => ipcRenderer.invoke(IPC_CHANNELS.settingsSetGlobal, value),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsGet, { id }),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
    rename: (id, title) => ipcRenderer.invoke(IPC_CHANNELS.projectsRename, { id, title }),
    duplicate: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsDuplicate, { id }),
    touch: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsTouch, { id }),
    saveScene: (id, scene) => ipcRenderer.invoke(IPC_CHANNELS.projectsSaveScene, { id, scene }),
    export: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsExport, { id }),
    import: (data) => ipcRenderer.invoke(IPC_CHANNELS.projectsImport, { data }),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsDelete, { id }),
  },
  media: {
    check: (references) => ipcRenderer.invoke(IPC_CHANNELS.mediaCheck, { references }),
    pick: (kind, label) => ipcRenderer.invoke(IPC_CHANNELS.mediaPick, { kind, label }),
  },
  live: {
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.liveGetSnapshot),
    probe: (input) => ipcRenderer.invoke(IPC_CHANNELS.liveProbe, input),
    connect: (input) => ipcRenderer.invoke(IPC_CHANNELS.liveConnect, input),
    reconnect: () => ipcRenderer.invoke(IPC_CHANNELS.liveReconnect),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.liveDisconnect),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.liveClear),
    getRecording: () => ipcRenderer.invoke(IPC_CHANNELS.liveGetRecording),
    replay: (fixture) => ipcRenderer.invoke(IPC_CHANNELS.liveReplay, fixture),
    onSnapshot: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: Parameters<typeof listener>[0]): void => listener(snapshot);
      ipcRenderer.on(IPC_CHANNELS.liveSnapshot, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.liveSnapshot, handler);
    },
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.aiGetConfig),
    setConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiSetConfig, input),
    testConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiTestConnection, input),
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiGenerate, input),
    cancel: (requestId) => ipcRenderer.invoke(IPC_CHANNELS.aiCancel, requestId),
    cancelAll: () => ipcRenderer.invoke(IPC_CHANNELS.aiCancelAll),
  },
  tts: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.ttsGetConfig),
    setConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.ttsSetConfig, input),
    testConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.ttsTestConnection, input),
    synthesize: (input) => ipcRenderer.invoke(IPC_CHANNELS.ttsSynthesize, input),
    cancel: (requestId) => ipcRenderer.invoke(IPC_CHANNELS.ttsCancel, requestId),
    cancelAll: () => ipcRenderer.invoke(IPC_CHANNELS.ttsCancelAll),
    clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.ttsClearCache),
  },
  sceneRuntime: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.sceneRuntimeGetStatus),
    publish: (scene, avatarState, presentation) => ipcRenderer.invoke(IPC_CHANNELS.sceneRuntimePublish, { scene, avatarState, presentation }),
  },
  obs: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.obsGetConfig),
    setConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.obsSetConfig, input),
    testConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.obsTestConnection, input),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.obsGetStatus),
    ensureOutput: (runtimeUrl) => ipcRenderer.invoke(IPC_CHANNELS.obsEnsureOutput, { runtimeUrl }),
    showOutput: () => ipcRenderer.invoke(IPC_CHANNELS.obsShowOutput),
    hideOutput: () => ipcRenderer.invoke(IPC_CHANNELS.obsHideOutput),
    startVirtualCamera: () => ipcRenderer.invoke(IPC_CHANNELS.obsStartVirtualCamera),
    stopVirtualCamera: () => ipcRenderer.invoke(IPC_CHANNELS.obsStopVirtualCamera),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.obsDisconnect),
  },
  shop: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.shopGetConfig),
    setConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.shopSetConfig, input),
    detectBrowsers: () => ipcRenderer.invoke(IPC_CHANNELS.shopDetectBrowsers),
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.shopGetSnapshot),
    open: () => ipcRenderer.invoke(IPC_CHANNELS.shopOpen),
    refreshProducts: () => ipcRenderer.invoke(IPC_CHANNELS.shopRefreshProducts),
    setMappings: (mappings) => ipcRenderer.invoke(IPC_CHANNELS.shopSetMappings, mappings),
    setSchedule: (schedule) => ipcRenderer.invoke(IPC_CHANNELS.shopSetSchedule, schedule),
    pinProduct: (remoteProductId) => ipcRenderer.invoke(IPC_CHANNELS.shopPinProduct, { remoteProductId }),
    startSchedule: () => ipcRenderer.invoke(IPC_CHANNELS.shopStartSchedule),
    pauseSchedule: () => ipcRenderer.invoke(IPC_CHANNELS.shopPauseSchedule),
    resumeSchedule: () => ipcRenderer.invoke(IPC_CHANNELS.shopResumeSchedule),
    skipScheduleItem: () => ipcRenderer.invoke(IPC_CHANNELS.shopSkipScheduleItem),
    stopSchedule: () => ipcRenderer.invoke(IPC_CHANNELS.shopStopSchedule),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.shopDisconnect),
    onSnapshot: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: Parameters<typeof listener>[0]): void => listener(snapshot);
      ipcRenderer.on(IPC_CHANNELS.shopSnapshot, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.shopSnapshot, handler);
    },
  },
  diagnostics: {
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetSnapshot),
    listLogs: (query = {}) => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsListLogs, query),
    exportLogs: (query = {}) => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExportLogs, query),
    clearLogs: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsClearLogs),
    recordQueueEvent: (event) => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsRecordQueueEvent, event),
  },
};

contextBridge.exposeInMainWorld('desktopApi', api);

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  databasePath: string;
}

export interface SettingRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface DesktopApi {
  app: {
    getInfo(): Promise<AppInfo>;
    rendererReady(): Promise<boolean>;
    onCloseRequested(listener: () => void): () => void;
    requestClose(): Promise<boolean>;
    respondToClose(response: { action: 'cancel' | 'quit'; remember: boolean }): Promise<boolean>;
    openAuxiliaryWindow(name: AuxiliaryWindowName): Promise<AuxiliaryWindowOpenResult>;
  };
  settings: {
    get<T = unknown>(key: string): Promise<SettingRecord<T> | null>;
    set(key: string, value: unknown): Promise<SettingRecord>;
    getGlobal(): Promise<SettingRecord<GlobalSettingsDocument> | null>;
    setGlobal(value: GlobalSettingsDocument): Promise<SettingRecord<GlobalSettingsDocument>>;
  };
  projects: {
    list(): Promise<ProjectRecord[]>;
    get(id: string): Promise<ProjectRecord | null>;
    create(input: ProjectCreateInput): Promise<ProjectRecord>;
    rename(id: string, title: string): Promise<ProjectRecord>;
    duplicate(id: string): Promise<ProjectRecord>;
    touch(id: string): Promise<ProjectRecord>;
    saveScene(id: string, scene: ProjectSceneDocument): Promise<ProjectRecord>;
    export(id: string): Promise<string>;
    import(data: string): Promise<ProjectRecord>;
    delete(id: string): Promise<boolean>;
  };
  media: {
    check(references: ProjectMediaReference[]): Promise<ProjectMediaStatus[]>;
    pick(kind: ProjectMediaKind, label: string): Promise<ProjectMediaReference | null>;
    pickMany(kind: ProjectMediaKind, label: string): Promise<ProjectMediaReference[]>;
    read(reference: ProjectMediaReference): Promise<string | null>;
    convertVideoToGif(reference: ProjectMediaReference): Promise<ProjectMediaReference>;
  };
  manualLive: {
    video: {
      list(): Promise<ManualVideoSnapshot>;
      import(input: ManualMediaImportInput): Promise<ManualVideoSnapshot>;
      play(): Promise<ManualVideoSnapshot>;
      pause(): Promise<ManualVideoSnapshot>;
      stop(): Promise<ManualVideoSnapshot>;
      next(): Promise<ManualVideoSnapshot>;
      previous(): Promise<ManualVideoSnapshot>;
      setLoop(loop: boolean): Promise<ManualVideoSnapshot>;
      onSnapshot(listener: (snapshot: ManualVideoSnapshot) => void): () => void;
    };
    audio: {
      list(): Promise<ManualAudioSnapshot>;
      import(input: ManualMediaImportInput): Promise<ManualAudioSnapshot>;
      play(): Promise<ManualAudioSnapshot>;
      pause(): Promise<ManualAudioSnapshot>;
      stop(): Promise<ManualAudioSnapshot>;
      next(): Promise<ManualAudioSnapshot>;
      previous(): Promise<ManualAudioSnapshot>;
      setVolume(volume: number): Promise<ManualAudioSnapshot>;
      setAutoNext(autoNext: boolean): Promise<ManualAudioSnapshot>;
      onSnapshot(listener: (snapshot: ManualAudioSnapshot) => void): () => void;
    };
  };
  live: {
    getSnapshot(): Promise<LiveSessionSnapshot>;
    probe(input: LiveProbeInput): Promise<LiveProbeResult>;
    connect(input: LiveConnectInput): Promise<LiveSessionSnapshot>;
    reconnect(): Promise<LiveSessionSnapshot>;
    disconnect(): Promise<LiveSessionSnapshot>;
    clear(): Promise<LiveSessionSnapshot>;
    getRecording(): Promise<LiveFixtureEnvelope>;
    replay(fixture: LiveFixtureEnvelope): Promise<LiveSessionSnapshot>;
    onSnapshot(listener: (snapshot: LiveSessionSnapshot) => void): () => void;
  };
  ai: {
    getConfig(): Promise<AiProviderConfig>;
    setConfig(input: AiProviderConfigInput): Promise<AiProviderConfig>;
    testConnection(input: AiProviderConfigInput): Promise<AiConnectionResult>;
    generate(input: AiRawGenerateRequest): Promise<AiRawGenerateResult>;
    cancel(requestId: string): Promise<boolean>;
    cancelAll(): Promise<number>;
  };
  tts: {
    getConfig(): Promise<TtsProviderConfig>;
    setConfig(input: TtsProviderConfigInput): Promise<TtsProviderConfig>;
    testConnection(input: TtsProviderConfigInput): Promise<TtsConnectionResult>;
    synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesisResult>;
    cancel(requestId: string): Promise<boolean>;
    cancelAll(): Promise<number>;
    clearCache(): Promise<number>;
  };
  sceneRuntime: {
    getStatus(): Promise<SceneRuntimeStatus>;
    publish(scene: ProjectSceneDocument, avatarState: AvatarSpeechState, presentation?: ScenePresentationState, tts?: import('./scene-runtime').SceneTtsPlayback | null): Promise<SceneRuntimeEvent>;
    onPlaybackEnded(listener: (event: SceneRuntimePlaybackEnded) => void): () => void;
    onTtsEvent(listener: (event: import('./scene-runtime').SceneRuntimeTtsEvent) => void): () => void;
  };
  timeline: {
    getSnapshot(): Promise<import('./timeline').TimelineOwnershipSnapshot>;
    handoff(owner: import('./timeline').TimelineOwner): Promise<import('./timeline').TimelineOwnershipSnapshot>;
  };
  liveState: {
    getSnapshot(): Promise<LiveStateSnapshot>;
    configure(projectId: string, scene: ProjectSceneDocument): Promise<LiveStateConfigurationResult>;
    play(command: PlayStateCommand): Promise<boolean>;
    onSnapshot(listener: (snapshot: LiveStateSnapshot) => void): () => void;
  };
  obs: {
    getConfig(): Promise<ObsConfig>;
    setConfig(input: ObsConfigInput): Promise<ObsConfig>;
    testConnection(input: ObsConfigInput): Promise<ObsConnectionResult>;
    getStatus(): Promise<ObsStatus>;
    ensureOutput(runtimeUrl: string): Promise<ObsOutputResult>;
    showOutput(): Promise<ObsStatus>;
    hideOutput(): Promise<ObsStatus>;
    startVirtualCamera(): Promise<ObsStatus>;
    stopVirtualCamera(): Promise<ObsStatus>;
    disconnect(): Promise<ObsStatus>;
  };
  shop: {
    getConfig(): Promise<ShopConfig>;
    setConfig(input: ShopConfig): Promise<ShopConfig>;
    detectBrowsers(): Promise<ShopBrowserCandidate[]>;
    getSnapshot(): Promise<ShopSnapshot>;
    open(): Promise<ShopOpenResult>;
    refreshProducts(): Promise<ShopActionResult>;
    setMappings(mappings: ShopProductMapping[]): Promise<ShopSnapshot>;
    setSchedule(schedule: ShopScheduleItem[]): Promise<ShopSnapshot>;
    pinProduct(remoteProductId: string): Promise<ShopActionResult>;
    startSchedule(): Promise<ShopActionResult>;
    pauseSchedule(): Promise<ShopActionResult>;
    resumeSchedule(): Promise<ShopActionResult>;
    skipScheduleItem(): Promise<ShopActionResult>;
    stopSchedule(): Promise<ShopActionResult>;
    disconnect(): Promise<ShopSnapshot>;
    onSnapshot(listener: (snapshot: ShopSnapshot) => void): () => void;
  };
  diagnostics: {
    getSnapshot(): Promise<DiagnosticsSnapshot>;
    listLogs(query?: DiagnosticLogQuery): Promise<DiagnosticLogEntry[]>;
    exportLogs(query?: DiagnosticLogQuery): Promise<string>;
    clearLogs(): Promise<number>;
    recordQueueEvent(event: QueueDiagnosticEvent): Promise<boolean>;
  };
}
import type { AuxiliaryWindowName, AuxiliaryWindowOpenResult } from './auxiliary-windows';
import type { GlobalSettingsDocument } from './global-settings';
import type { LiveConnectInput, LiveFixtureEnvelope, LiveProbeInput, LiveProbeResult, LiveSessionSnapshot } from './live';
import type { ProjectCreateInput, ProjectMediaKind, ProjectMediaReference, ProjectMediaStatus, ProjectRecord, ProjectSceneDocument } from './projects';
import type { AiConnectionResult, AiProviderConfig, AiProviderConfigInput, AiRawGenerateRequest, AiRawGenerateResult } from './ai';
import type { TtsConnectionResult, TtsProviderConfig, TtsProviderConfigInput, TtsSynthesisResult, TtsSynthesizeInput } from './tts';
import type { AvatarSpeechState } from './queue';
import type { ScenePresentationState, SceneRuntimeEvent, SceneRuntimePlaybackEnded, SceneRuntimeStatus } from './scene-runtime';
import type { ObsConfig, ObsConfigInput, ObsConnectionResult, ObsOutputResult, ObsStatus } from './obs';
import type { ShopActionResult, ShopBrowserCandidate, ShopConfig, ShopOpenResult, ShopProductMapping, ShopScheduleItem, ShopSnapshot } from './shop';
import type { DiagnosticLogEntry, DiagnosticLogQuery, DiagnosticsSnapshot, QueueDiagnosticEvent } from './diagnostics';
import type { LiveStateConfigurationResult, LiveStateSnapshot, PlayStateCommand } from './live-state';
import type { ManualAudioSnapshot, ManualMediaImportInput, ManualVideoSnapshot } from './manual-live';

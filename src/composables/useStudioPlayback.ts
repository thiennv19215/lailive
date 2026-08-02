import { onBeforeUnmount, ref, type Ref } from 'vue';
import { PreparedScriptPlaybackController, type PreparedScriptPlaybackSnapshot } from '../modules/playback/prepared-script-playback';
import type { ProjectMediaStatus, ProjectPreparedScript, PreparedScriptRole, ProjectSceneDocument, ProjectSceneLayer } from '../shared/contracts/projects';
import type { ScenePresentationState } from '../shared/contracts/scene-runtime';
import type { SceneTtsPlayback } from '../shared/contracts/scene-runtime';
import type { AvatarSpeechState } from '../shared/contracts/queue';
import type { AvatarVideoSnapshot } from '../modules/playback/avatar-video-state-manager';

type StudioPlaybackOptions = {
  scene: Ref<ProjectSceneDocument>; layers: Ref<ProjectSceneLayer[]>; mediaStatuses: Ref<ProjectMediaStatus[]>; projectLoaded: Ref<boolean>;
  avatarState: Ref<AvatarSpeechState>; buildSceneDocument: () => ProjectSceneDocument; onPublishError: (message: string) => void; onPlaybackError: (message: string) => void;
  avatarVideo: Ref<AvatarVideoSnapshot>;
};
const EMPTY_SNAPSHOT: PreparedScriptPlaybackSnapshot = { mode: 'stopped', activeScriptId: null, activeLayerId: null, pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null, playbackRevision: 0, resumeActiveMedia: false, queuedScriptIds: [], errorMessage: null };

export function useStudioPlayback(options: StudioPlaybackOptions) {
  const snapshot = ref<PreparedScriptPlaybackSnapshot>(EMPTY_SNAPSHOT);
  const controller = new PreparedScriptPlaybackController();
  let publishTail: Promise<void> = Promise.resolve();
  let ttsAbort: AbortController | null = null;
  let ttsPlayback: SceneTtsPlayback | null = null;
  const scripts = () => options.scene.value.preparedScriptSettings.scripts;
  const activeScript = (current = snapshot.value) => scripts().find((script) => script.id === current.activeScriptId);

  function sync(): void {
    const avatarLayerIds = new Set(options.layers.value.filter((layer) => layer.kind === 'avatar').map((layer) => layer.id));
    // Older projects could retain a video/audio ID in this avatar-only field.
    // Repair it before autosave so the project becomes valid without losing media.
    scripts().forEach((script) => {
      if (script.avatarLayerId && !avatarLayerIds.has(script.avatarLayerId)) script.avatarLayerId = null;
      // Older UI versions stored a standalone audio clip only as an attached
      // track on an otherwise empty video script. Promote it to a playable clip.
      if (script.playbackType === 'video' && script.mediaLayerId === null && script.audioLayerId) {
        script.playbackType = 'audio';
        script.mediaLayerId = script.audioLayerId;
        script.audioLayerId = null;
      }
      if (script.playbackType === 'audio' && script.audioLayerId) {
        // Audio cannot be both the primary source and a video-only attached track.
        if (script.mediaLayerId === null) script.mediaLayerId = script.audioLayerId;
        script.audioLayerId = null;
      }
    });
    controller.configure(options.scene.value.preparedScriptSettings, options.layers.value
      .filter((layer) => layer.kind === 'video' || layer.kind === 'audio' || layer.kind === 'avatar')
      .map((layer) => ({ id: layer.id, kind: layer.kind, loop: layer.loop, muted: layer.muted, volume: layer.volume, available: layer.source.type === 'builtin' || options.mediaStatuses.value.find((status) => status.id === layer.source.mediaReferenceId)?.exists !== false })));
  }
  function presentation(current: PreparedScriptPlaybackSnapshot): ScenePresentationState {
    const script = activeScript(current);
    const layer = script?.mediaLayerId ? options.layers.value.find((candidate) => candidate.id === script.mediaLayerId) : undefined;
    const audio = script?.audioLayerId ? options.layers.value.find((candidate) => candidate.id === script.audioLayerId) : undefined;
    const motion = options.avatarVideo.value;
    return { mode: current.mode, activeScriptId: current.activeScriptId, activeLayerId: current.activeLayerId, pendingLayerId: current.pendingLayerId, activeAudioLayerId: current.activeAudioLayerId, pendingAudioLayerId: current.pendingAudioLayerId, activeAvatarLayerId: motion.activeLayerId ?? current.activeAvatarLayerId, activeAvatarTransitionLayerId: motion.previousLayerId, pendingAvatarLayerId: motion.pendingLayerId, managedLayerIds: scripts().flatMap((item) => [item.mediaLayerId, item.audioLayerId, item.avatarLayerId].filter((id): id is string => Boolean(id))), playbackRevision: Math.max(current.playbackRevision, motion.revision), resumeActiveMedia: current.resumeActiveMedia, activePaused: current.mode !== 'playing', activeMuted: layer?.muted ?? true, activeVolume: layer?.volume ?? 0, activeLoop: false, activeAudioMuted: audio?.muted ?? true, activeAudioVolume: audio?.volume ?? 0 };
  }
  function publish(): Promise<void> {
    if (!options.projectLoaded.value) return Promise.resolve();
    // Serialize publications. Callers that await this only receive control once
    // their current scene is available from the loopback asset server.
    publishTail = publishTail.catch(() => undefined).then(async () => {
      try { await globalThis.window.desktopApi.sceneRuntime.publish(structuredClone(options.buildSceneDocument()), options.avatarState.value, structuredClone(presentation(snapshot.value)), structuredClone(ttsPlayback)); }
      catch (error) { options.onPublishError(error instanceof Error ? error.message : String(error)); }
    });
    return publishTail;
  }
  function add(type: ProjectPreparedScript['playbackType'], mediaLayerId: string | null = null, role: PreparedScriptRole = 'idle'): void {
    if (scripts().length >= 20) return options.onPublishError('Kịch bản chờ đã đủ 20 mục.');
    const order = scripts().length;
    const layer = mediaLayerId ? options.layers.value.find((candidate) => candidate.id === mediaLayerId) : undefined;
    const label = role === 'activation' ? 'Cảnh ưu tiên' : role === 'conversation' ? 'Phản hồi tức thời' : 'Thoại chờ';
    const script: ProjectPreparedScript = { id: `script-${globalThis.crypto.randomUUID()}`, name: `R${order + 1} - ${layer?.name ?? label}`, enabled: true, order, playbackType: type, role, mediaLayerId, audioLayerId: null, avatarLayerId: null, speechText: type === 'tts' ? 'Xin chào, cảm ơn bạn đã chờ.' : '', interruptMode: role === 'idle' ? 'after-current' : 'immediate', completionMode: 'resume-sequence' };
    scripts().push(script);
    sync();
    if (role !== 'idle') controller.playPriority(script.id);
  }
  function remove(index: number): void { scripts().splice(index, 1); normalize(); sync(); }
  function removeForLayer(layerId: string): void {
    const removedScripts = scripts().filter((script) => script.mediaLayerId === layerId || script.audioLayerId === layerId || script.avatarLayerId === layerId);
    const remaining = scripts().filter((script) => !removedScripts.includes(script));
    if (remaining.length === scripts().length) return;
    const removedActive = removedScripts.some((script) => script.id === snapshot.value.activeScriptId);
    if (removedActive) cancelTts();
    controller.removeScripts(removedScripts.map((script) => script.id));
    scripts().splice(0, scripts().length, ...remaining);
    normalize();
    sync();
  }
  function move(index: number, delta: number): void { const target = index + delta; if (target < 0 || target >= scripts().length) return; [scripts()[index], scripts()[target]] = [scripts()[target]!, scripts()[index]!]; normalize(); sync(); }
  function normalize(): void { scripts().forEach((script, order) => { script.order = order; }); }
  function toggle(): void { options.scene.value.preparedScriptSettings.enabled = !options.scene.value.preparedScriptSettings.enabled; sync(); }
  function cancelTts(): void { ttsAbort?.abort(); ttsAbort = null; void globalThis.window.desktopApi.tts.cancelAll(); }
  async function startTts(script: ProjectPreparedScript, revision: number): Promise<void> {
    cancelTts();
    const abort = new AbortController(); ttsAbort = abort;
    try {
      const result = await globalThis.window.desktopApi.tts.synthesize({ requestId: `prepared-${script.id}-${revision}`, text: script.speechText, voice: options.scene.value.ttsSettings.voice, speed: options.scene.value.ttsSettings.speed, volume: options.scene.value.ttsSettings.volume, timeoutMs: options.scene.value.ttsSettings.timeoutMs });
      if (abort.signal.aborted || snapshot.value.activeScriptId !== script.id || snapshot.value.playbackRevision !== revision) return;
      ttsPlayback = { requestId: result.requestId, audioBase64: result.audioBase64, mimeType: result.mimeType ?? 'audio/mpeg', speed: options.scene.value.ttsSettings.speed, volume: options.scene.value.ttsSettings.volume };
      await publish();
    } catch (error) {
      if (!abort.signal.aborted) controller.onError(script.id, revision, error instanceof Error ? error.message : 'TTS không phát được.');
    } finally { if (ttsAbort === abort) ttsAbort = null; }
  }
  const unsubscribe = controller.subscribe((current) => {
    const previous = snapshot.value; snapshot.value = current;
    // A missing/orphaned source can fail before a media element is mounted.
    // Surface that controller failure in the Studio notice immediately.
    if (current.errorMessage && current.errorMessage !== previous.errorMessage) options.onPlaybackError(current.errorMessage);
    const script = activeScript(current);
    options.avatarState.value = script && (script.playbackType === 'audio' || Boolean(script.audioLayerId) || (script.playbackType === 'tts' && current.mode === 'playing')) && ['loading', 'playing', 'paused'].includes(current.mode) ? 'talking' : 'idle';
    if (script?.playbackType === 'tts' && current.mode === 'loading' && (previous.activeScriptId !== script.id || previous.playbackRevision !== current.playbackRevision)) void startTts(script, current.playbackRevision);
    if (!current.activeScriptId && previous.activeScriptId) { cancelTts(); ttsPlayback = null; }
    void publish();
  });
  const unsubscribeRuntimeEnded = globalThis.window.desktopApi.sceneRuntime.onPlaybackEnded((payload) => {
    const event = payload as { scriptId?: unknown; playbackRevision?: unknown };
    if (typeof event.scriptId === 'string' && typeof event.playbackRevision === 'number') controller.onEnded(event.scriptId, event.playbackRevision);
  });
  const unsubscribeTts = globalThis.window.desktopApi.sceneRuntime.onTtsEvent((event) => {
    if (!ttsPlayback || event.requestId !== ttsPlayback.requestId) return;
    const current = snapshot.value;
    if (!current.activeScriptId) return;
    if (event.kind === 'started') controller.onReady(current.activeScriptId, current.playbackRevision);
    if (event.kind === 'ended') controller.onEnded(current.activeScriptId, current.playbackRevision);
    if (event.kind === 'error') controller.onError(current.activeScriptId, current.playbackRevision, event.error ?? 'TTS không phát được.');
  });
  onBeforeUnmount(() => { cancelTts(); unsubscribe(); unsubscribeRuntimeEnded(); unsubscribeTts(); controller.dispose(); });
  return { snapshot, scripts, sync, publish, add, remove, removeForLayer, move, normalize, toggle, startSequence: (id?: string) => controller.startSequence(id), playScript: (id: string) => controller.playScript(id), playRole: (role: PreparedScriptRole) => controller.playRole(role), pause: () => controller.pause(), resume: () => controller.resume(), skip: () => controller.skip(), stop: () => { cancelTts(); return controller.stop(); }, ready: (scriptId: string, revision: number) => controller.onReady(scriptId, revision), ended: (scriptId: string, revision: number) => controller.onEnded(scriptId, revision), error: (scriptId: string, revision: number, message: string) => controller.onError(scriptId, revision, message) };
}

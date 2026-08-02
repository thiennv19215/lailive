import { onBeforeUnmount, ref, type Ref } from 'vue';
import { PreparedScriptPlaybackController, type PreparedScriptPlaybackSnapshot } from '../modules/playback/prepared-script-playback';
import { playTtsResult } from '../modules/tts/playback';
import type { ProjectMediaStatus, ProjectPreparedScript, ProjectSceneDocument, ProjectSceneLayer } from '../shared/contracts/projects';
import type { ScenePresentationState } from '../shared/contracts/scene-runtime';
import type { AvatarSpeechState } from '../shared/contracts/queue';

type StudioPlaybackOptions = {
  scene: Ref<ProjectSceneDocument>; layers: Ref<ProjectSceneLayer[]>; mediaStatuses: Ref<ProjectMediaStatus[]>; projectLoaded: Ref<boolean>;
  avatarState: Ref<AvatarSpeechState>; buildSceneDocument: () => ProjectSceneDocument; onPublishError: (message: string) => void;
};
const EMPTY_SNAPSHOT: PreparedScriptPlaybackSnapshot = { mode: 'stopped', activeScriptId: null, activeLayerId: null, activeAvatarLayerId: null, playbackRevision: 0, queuedScriptIds: [], errorMessage: null };

export function useStudioPlayback(options: StudioPlaybackOptions) {
  const snapshot = ref<PreparedScriptPlaybackSnapshot>(EMPTY_SNAPSHOT);
  const controller = new PreparedScriptPlaybackController();
  let publishInFlight = false;
  let publishQueued = false;
  let ttsAbort: AbortController | null = null;
  const scripts = () => options.scene.value.preparedScriptSettings.scripts;
  const activeScript = (current = snapshot.value) => scripts().find((script) => script.id === current.activeScriptId);

  function sync(): void {
    controller.configure(options.scene.value.preparedScriptSettings, options.layers.value
      .filter((layer) => layer.kind === 'video' || layer.kind === 'audio' || layer.kind === 'avatar')
      .map((layer) => ({ id: layer.id, kind: layer.kind, loop: layer.loop, muted: layer.muted, volume: layer.volume, available: layer.source.type === 'builtin' || options.mediaStatuses.value.find((status) => status.id === layer.source.mediaReferenceId)?.exists !== false })));
  }
  function presentation(current: PreparedScriptPlaybackSnapshot): ScenePresentationState {
    const script = activeScript(current);
    const layer = script?.mediaLayerId ? options.layers.value.find((candidate) => candidate.id === script.mediaLayerId) : undefined;
    return { mode: current.mode, activeScriptId: current.activeScriptId, activeLayerId: current.activeLayerId, activeAvatarLayerId: current.activeAvatarLayerId, managedLayerIds: scripts().flatMap((item) => [item.mediaLayerId, item.avatarLayerId].filter((id): id is string => Boolean(id))), playbackRevision: current.playbackRevision, activePaused: current.mode === 'paused' || current.mode === 'stopped' || current.mode === 'error', activeMuted: layer?.muted ?? true, activeVolume: layer?.volume ?? 0, activeLoop: layer?.loop ?? false };
  }
  async function publish(current = snapshot.value): Promise<void> {
    if (!options.projectLoaded.value) return;
    if (publishInFlight) { publishQueued = true; return; }
    publishInFlight = true;
    try { await globalThis.window.desktopApi.sceneRuntime.publish(structuredClone(options.buildSceneDocument()), options.avatarState.value, structuredClone(presentation(current))); }
    catch (error) { options.onPublishError(error instanceof Error ? error.message : String(error)); }
    finally { publishInFlight = false; if (publishQueued) { publishQueued = false; void publish(); } }
  }
  function add(type: ProjectPreparedScript['playbackType'], mediaLayerId: string | null = null): void {
    if (scripts().length >= 20) return options.onPublishError('Kịch bản chờ đã đủ 20 mục.');
    const order = scripts().length;
    const layer = mediaLayerId ? options.layers.value.find((candidate) => candidate.id === mediaLayerId) : undefined;
    scripts().push({ id: `script-${globalThis.crypto.randomUUID()}`, name: `R${order + 1} - ${layer?.name ?? 'Thoại chờ'}`, enabled: true, order, playbackType: type, mediaLayerId, avatarLayerId: null, speechText: type === 'tts' ? 'Xin chào, cảm ơn bạn đã chờ.' : '', interruptMode: 'immediate', completionMode: 'next' });
    sync();
  }
  function remove(index: number): void { scripts().splice(index, 1); normalize(); sync(); }
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
      controller.onReady(script.id, revision);
      await playTtsResult(result, options.scene.value.ttsSettings, abort.signal);
      controller.onEnded(script.id, revision);
    } catch (error) {
      if (!abort.signal.aborted) controller.onError(script.id, revision, error instanceof Error ? error.message : 'TTS không phát được.');
    } finally { if (ttsAbort === abort) ttsAbort = null; }
  }
  const unsubscribe = controller.subscribe((current) => {
    const previous = snapshot.value; snapshot.value = current;
    const script = activeScript(current);
    options.avatarState.value = script && (script.playbackType === 'audio' || script.playbackType === 'tts') && ['loading', 'playing', 'paused'].includes(current.mode) ? 'talking' : 'idle';
    if (script?.playbackType === 'tts' && current.mode === 'loading' && (previous.activeScriptId !== script.id || previous.playbackRevision !== current.playbackRevision)) void startTts(script, current.playbackRevision);
    if (!current.activeScriptId && previous.activeScriptId) cancelTts();
    void publish(current);
  });
  onBeforeUnmount(() => { cancelTts(); unsubscribe(); controller.dispose(); });
  return { snapshot, scripts, sync, publish, add, remove, move, normalize, toggle, startSequence: (id?: string) => controller.startSequence(id), playScript: (id: string) => controller.playScript(id), pause: () => controller.pause(), resume: () => controller.resume(), skip: () => controller.skip(), stop: () => { cancelTts(); return controller.stop(); }, ready: (scriptId: string, revision: number) => controller.onReady(scriptId, revision), ended: (scriptId: string, revision: number) => controller.onEnded(scriptId, revision), error: (scriptId: string, revision: number, message: string) => controller.onError(scriptId, revision, message) };
}

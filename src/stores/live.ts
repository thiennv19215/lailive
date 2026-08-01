import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ModerationEngine } from '../modules/triggers/moderation-engine';
import { createDefaultModerationSettings, type ModerationDecision, type ModerationSettings } from '../shared/contracts/moderation';
import {
  DEFAULT_MOCK_LIVE_EVENTS,
  LIVE_FIXTURE_FORMAT,
  LIVE_FIXTURE_VERSION,
  createDisconnectedLiveSnapshot,
  type LiveConnectInput,
  type LiveSessionSnapshot,
} from '../shared/contracts/live';
import type { AiReplyResult, AiReplySettings } from '../shared/contracts/ai';
import type { ProductCatalogItem } from '../shared/contracts/products';
import { matchProduct } from '../modules/products/matcher';
import { generateAiReply } from '../modules/ai/reply-coordinator';
import { aiReplySettingsSchema } from '../shared/validation/ai';
import { productCatalogSchema } from '../shared/validation/products';
import { InteractionQueue } from '../modules/queue/interaction-queue';
import { playTtsResult } from '../modules/tts/playback';
import { createFallbackReply } from '../modules/ai/reply-engine';
import { createDefaultTtsProjectSettings, type TtsProjectSettings } from '../shared/contracts/tts';
import type { InteractionQueueSnapshot } from '../shared/contracts/queue';
import { ttsProjectSettingsSchema } from '../shared/validation/tts';

export const useLiveStore = defineStore('live', () => {
  const snapshot = ref<LiveSessionSnapshot>(createDisconnectedLiveSnapshot());
  const initialized = ref(false);
  const busy = ref(false);
  const error = ref('');
  const decisions = ref<ModerationDecision[]>([]);
  const aiReplies = ref<AiReplyResult[]>([]);
  const queueSnapshot = ref<InteractionQueueSnapshot>({ jobs: [], activeJobId: null, avatarState: 'idle', queuedCount: 0 });
  const processedEventIds = new Set<string>();
  const moderationEngine = new ModerationEngine(createDefaultModerationSettings());
  let aiSettings: AiReplySettings | null = null;
  let aiProducts: ProductCatalogItem[] = [];
  let bannedOutputTerms: string[] = [];
  let ttsSettings: TtsProjectSettings = createDefaultTtsProjectSettings();
  const interactionQueue = new InteractionQueue({
    generateAi: generateAiReply,
    cancelAi: (requestId) => globalThis.window.desktopApi.ai.cancel(requestId),
    synthesize: (input) => globalThis.window.desktopApi.tts.synthesize(input),
    cancelTts: (requestId) => globalThis.window.desktopApi.tts.cancel(requestId),
    play: playTtsResult,
    onDiagnostic: (event) => { void globalThis.window.desktopApi.diagnostics.recordQueueEvent(event); },
  });
  interactionQueue.subscribe((next) => {
    queueSnapshot.value = next;
    aiReplies.value = next.jobs.map((job) => job.aiReply).filter((reply): reply is AiReplyResult => reply !== null);
  });
  let unsubscribe: (() => void) | null = null;

  const isConnected = computed(() => snapshot.value.status === 'connected');
  const isTransitioning = computed(() => ['connecting', 'reconnecting'].includes(snapshot.value.status));

  function applySnapshot(next: LiveSessionSnapshot): void {
    snapshot.value = next;
    const pending = next.events
      .filter((event) => ['chat', 'gift', 'like', 'follow', 'share'].includes(event.type) && !processedEventIds.has(event.id))
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    for (const event of pending) {
      processedEventIds.add(event.id);
      const decision = moderationEngine.decide({ event, now: new Date(event.timestamp) });
      decisions.value = [decision, ...decisions.value].slice(0, 200);
      if (decision.status === 'accepted' && decision.actionType !== 'ignore' && aiSettings) {
        const productMatch = event.type === 'chat' ? matchProduct(event.text ?? '', aiProducts) : null;
        interactionQueue.enqueue({
          id: `queue-${event.id}`, event, actionType: decision.actionType,
          directText: createFallbackReply(event, productMatch?.match?.product ?? null),
          aiInput: decision.actionType === 'ai_speech' ? {
            requestId: `ai-${event.id}-${Date.now()}`, event, settings: aiSettings, productMatch, bannedOutputTerms,
          } : null,
          ttsSettings,
        });
      }
    }
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return;
    applySnapshot(await globalThis.window.desktopApi.live.getSnapshot());
    unsubscribe = globalThis.window.desktopApi.live.onSnapshot(applySnapshot);
    initialized.value = true;
  }

  async function connect(input: LiveConnectInput): Promise<void> {
    busy.value = true;
    error.value = '';
    resetModerationSession();
    await interactionQueue.clear();
    try {
      applySnapshot(await globalThis.window.desktopApi.live.connect(input));
      if (snapshot.value.status === 'error') error.value = snapshot.value.lastError ?? 'Không thể kết nối TikTok Live.';
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : 'Không thể kết nối TikTok Live.';
    } finally {
      busy.value = false;
    }
  }

  async function reconnect(): Promise<void> {
    busy.value = true;
    error.value = '';
    resetModerationSession();
    await interactionQueue.clear();
    try {
      applySnapshot(await globalThis.window.desktopApi.live.reconnect());
      if (snapshot.value.status === 'error') error.value = snapshot.value.lastError ?? 'Không thể kết nối lại.';
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : 'Không thể kết nối lại.';
    } finally {
      busy.value = false;
    }
  }

  async function disconnect(): Promise<void> {
    busy.value = true;
    try {
      applySnapshot(await globalThis.window.desktopApi.live.disconnect());
    } finally {
      busy.value = false;
    }
  }

  async function clear(): Promise<void> {
    await interactionQueue.clear();
    resetModerationSession();
    aiReplies.value = [];
    applySnapshot(await globalThis.window.desktopApi.live.clear());
  }

  async function replayDefaultFixture(): Promise<void> {
    applySnapshot(await globalThis.window.desktopApi.live.replay({
      format: LIVE_FIXTURE_FORMAT,
      version: LIVE_FIXTURE_VERSION,
      recordedAt: new Date().toISOString(),
      events: DEFAULT_MOCK_LIVE_EVENTS,
    }));
  }

  async function exportRecording(): Promise<string> {
    return JSON.stringify(await globalThis.window.desktopApi.live.getRecording(), null, 2);
  }

  function dispose(): void {
    void interactionQueue.clear();
    unsubscribe?.();
    unsubscribe = null;
    initialized.value = false;
  }

  function configureModeration(settings: ModerationSettings): void {
    moderationEngine.updateSettings(settings);
  }

  function decisionFor(eventId: string): ModerationDecision | undefined {
    return decisions.value.find((decision) => decision.eventId === eventId);
  }

  function aiReplyFor(eventId: string): AiReplyResult | undefined {
    return aiReplies.value.find((reply) => reply.eventId === eventId);
  }

  function configureAi(settings: AiReplySettings, products: ProductCatalogItem[], bannedTerms: string[]): void {
    aiSettings = aiReplySettingsSchema.parse(settings);
    aiProducts = productCatalogSchema.parse(products);
    bannedOutputTerms = [...bannedTerms];
  }

  function configureTts(settings: TtsProjectSettings): void {
    ttsSettings = ttsProjectSettingsSchema.parse(settings);
  }

  function queueJobFor(eventId: string) {
    return queueSnapshot.value.jobs.find((job) => job.event.id === eventId);
  }

  function previewTts(text: string): string {
    const event = {
      id: `tts-preview-${Date.now()}`, type: 'chat' as const, source: 'mock' as const,
      timestamp: new Date().toISOString(), user: { id: 'tts-preview', uniqueId: 'tts.preview', nickname: 'TTS preview' }, text,
    };
    const id = `queue-${event.id}`;
    interactionQueue.enqueue({ id, event, actionType: 'voice_tts', directText: text, aiInput: null, ttsSettings });
    return id;
  }

  function resetModerationSession(): void {
    moderationEngine.reset();
    processedEventIds.clear();
    decisions.value = [];
  }

  return { snapshot, initialized, busy, error, decisions, aiReplies, queueSnapshot, isConnected, isTransitioning, initialize, connect, reconnect, disconnect, clear, replayDefaultFixture, exportRecording, configureModeration, configureAi, configureTts, previewTts, decisionFor, aiReplyFor, queueJobFor, skipCurrentQueueJob: () => interactionQueue.skipCurrent(), clearQueue: () => interactionQueue.clear(), retryQueueJob: (jobId: string) => interactionQueue.retry(jobId), dispose };
});

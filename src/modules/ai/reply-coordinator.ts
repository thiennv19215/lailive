import type { AiGenerateInput, AiReplyResult } from '../../shared/contracts/ai';
import { buildAiPrompt, cleanAiReply, createFallbackReply, inspectAiReply } from './reply-engine';

function isCancellation(reason: unknown): boolean {
  if (reason instanceof DOMException && reason.name === 'AbortError') return true;
  return reason instanceof Error && /abort|cancel/i.test(`${reason.name} ${reason.message}`);
}

export async function generateAiReply(input: AiGenerateInput): Promise<AiReplyResult> {
  const prompt = buildAiPrompt(input);
  try {
    const generated = await globalThis.window.desktopApi.ai.generate({
      requestId: input.requestId,
      systemMessage: prompt.systemMessage,
      userMessage: prompt.userMessage,
      timeoutMs: input.settings.timeoutMs,
      retryCount: input.settings.retryCount,
    });
    const cleaned = cleanAiReply(generated.text);
    const rejection = inspectAiReply(cleaned, prompt.product, input.bannedOutputTerms);
    if (!rejection) return {
      requestId: input.requestId, eventId: input.event.id, status: 'success', text: cleaned,
      provider: generated.provider, model: generated.model, attempts: generated.attempts, reason: null, prompt,
    };
    if (!input.settings.fallbackEnabled) return {
      requestId: input.requestId, eventId: input.event.id, status: 'error', text: '',
      provider: generated.provider, model: generated.model, attempts: generated.attempts, reason: rejection, prompt,
    };
    return {
      requestId: input.requestId, eventId: input.event.id, status: 'fallback',
      text: createFallbackReply(input.event, prompt.product), provider: generated.provider,
      model: generated.model, attempts: generated.attempts, reason: rejection, prompt,
    };
  } catch (reason) {
    const config = await globalThis.window.desktopApi.ai.getConfig();
    if (isCancellation(reason)) return {
      requestId: input.requestId, eventId: input.event.id, status: 'cancelled', text: '',
      provider: config.kind, model: config.model, attempts: 0, reason: 'cancelled', prompt,
    };
    if (input.settings.fallbackEnabled) return {
      requestId: input.requestId, eventId: input.event.id, status: 'fallback',
      text: createFallbackReply(input.event, prompt.product), provider: config.kind,
      model: config.model, attempts: 0, reason: reason instanceof Error ? reason.message : 'provider-error', prompt,
    };
    return {
      requestId: input.requestId, eventId: input.event.id, status: 'error', text: '',
      provider: config.kind, model: config.model, attempts: 0,
      reason: reason instanceof Error ? reason.message : 'provider-error', prompt,
    };
  }
}


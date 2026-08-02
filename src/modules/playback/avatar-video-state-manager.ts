import type { AvatarVideoState } from '../../shared/contracts/projects';

export const AVATAR_TRANSITION_DURATION = 300;
export type AvatarVideoPlaybackMode = 'idle' | 'preparing' | 'transitioning' | 'error';
export type AvatarVideoSnapshot = {
  mode: AvatarVideoPlaybackMode;
  state: AvatarVideoState | null;
  activeLayerId: string | null;
  previousLayerId: string | null;
  pendingLayerId: string | null;
  revision: number;
  queuedStates: AvatarVideoState[];
  errorMessage: string | null;
};

const priority: Record<AvatarVideoState, number> = { idle: 0, talk: 2, 'point-product': 2, 'point-cart': 2, listen: 2, wave: 3, thank: 4 };

export class AvatarVideoStateManager {
  private states = new Map<AvatarVideoState, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(snapshot: AvatarVideoSnapshot) => void>();
  private value: AvatarVideoSnapshot = { mode: 'idle', state: null, activeLayerId: null, previousLayerId: null, pendingLayerId: null, revision: 0, queuedStates: [], errorMessage: null };

  configure(entries: Iterable<[AvatarVideoState, string]>): void { this.states = new Map(entries); if (!this.value.activeLayerId && this.states.has('idle')) this.request('idle'); }
  subscribe(listener: (snapshot: AvatarVideoSnapshot) => void): () => void { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  snapshot(): AvatarVideoSnapshot { return { ...this.value, queuedStates: [...this.value.queuedStates] }; }
  request(state: AvatarVideoState): boolean {
    const layerId = this.states.get(state); if (!layerId) return this.fail(`Avatar state ${state} is not configured.`);
    if (this.value.state === state || this.value.pendingLayerId === layerId) return false;
    if (this.value.mode === 'preparing' || this.value.mode === 'transitioning') { this.queue(state); return true; }
    this.prepare(state, layerId); return true;
  }
  ready(layerId: string): boolean {
    if (this.value.mode !== 'preparing' || this.value.pendingLayerId !== layerId) return false;
    this.value = { ...this.value, mode: 'transitioning', state: this.stateFor(layerId), previousLayerId: this.value.activeLayerId, activeLayerId: layerId, pendingLayerId: null, revision: this.value.revision + 1 };
    this.emit(); this.timer = setTimeout(() => this.finishTransition(), AVATAR_TRANSITION_DURATION); return true;
  }
  ended(layerId: string): boolean {
    if (layerId !== this.value.activeLayerId || this.value.state === 'idle') return false;
    const next = this.dequeue() ?? 'idle'; const nextLayer = this.states.get(next); if (!nextLayer) return this.fail(`Avatar state ${next} is not configured.`);
    this.prepare(next, nextLayer); return true;
  }
  dispose(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; this.listeners.clear(); }
  private prepare(state: AvatarVideoState, layerId: string): void { this.value = { ...this.value, mode: 'preparing', pendingLayerId: layerId, errorMessage: null }; this.emit(); }
  private finishTransition(): void { this.timer = null; this.value = { ...this.value, mode: 'idle', previousLayerId: null }; this.emit(); const next = this.dequeue(); if (next) this.request(next); }
  private queue(state: AvatarVideoState): void { const queued = this.value.queuedStates.filter((item) => item !== state); queued.push(state); queued.sort((a, b) => priority[b] - priority[a]); this.value = { ...this.value, queuedStates: queued }; this.emit(); }
  private dequeue(): AvatarVideoState | null { const state = this.value.queuedStates[0] ?? null; this.value.queuedStates = this.value.queuedStates.slice(1); return state; }
  private stateFor(layerId: string): AvatarVideoState | null { return [...this.states.entries()].find(([, id]) => id === layerId)?.[0] ?? null; }
  private fail(message: string): false { this.value = { ...this.value, mode: 'error', errorMessage: message }; this.emit(); return false; }
  private emit(): void { for (const listener of this.listeners) listener(this.snapshot()); }
}

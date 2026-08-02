import fs from 'node:fs';
import http, { type ServerResponse } from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { sceneRuntimeLogSchema, sceneRuntimePlaybackEndedSchema, sceneRuntimePublishSchema, sceneRuntimeReadySchema } from '../../src/shared/validation/scene-runtime';
import { createDefaultScenePresentationState, type ScenePresentationState, type SceneRuntimeBrowserLog, type SceneRuntimeEvent, type SceneRuntimePlaybackEnded, type SceneRuntimeState, type SceneRuntimeStatus } from '../../src/shared/contracts/scene-runtime';
import type { ProjectLayerAssetId } from '../../src/shared/contracts/projects';
import type { AvatarSpeechState } from '../../src/shared/contracts/queue';

const HOST = '127.0.0.1' as const;
const MAX_BODY_BYTES = 16_384;
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.m4v': 'video/x-m4v',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
};

export interface SceneRuntimeOptions {
  rendererDirectory: string;
  assets: Record<ProjectLayerAssetId, string>;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJson(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
}

function changedTopLevelKeys(previous: SceneRuntimeState | null, next: SceneRuntimeState): string[] {
  if (!previous) return ['scene', 'avatarState', 'presentation'];
  const keys: string[] = [];
  if (previous.avatarState !== next.avatarState) keys.push('avatarState');
  if (JSON.stringify(previous.presentation) !== JSON.stringify(next.presentation)) keys.push('presentation');
  for (const key of Object.keys(next.scene) as Array<keyof SceneRuntimeState['scene']>) {
    if (JSON.stringify(previous.scene[key]) !== JSON.stringify(next.scene[key])) keys.push(`scene.${String(key)}`);
  }
  return keys;
}

export class SceneRuntimeService {
  private server: http.Server | null = null;
  private port: number | null = null;
  private revision = 0;
  private state: SceneRuntimeState | null = null;
  private lastPublishedAt: string | null = null;
  private lastReadyAt: string | null = null;
  private readonly clients = new Map<ServerResponse, string | null>();
  private readonly readyClients = new Set<string>();
  private readonly logs: SceneRuntimeBrowserLog[] = [];
  private readonly listeners = new Set<(status: SceneRuntimeStatus) => void>();
  private readonly playbackEndedListeners = new Set<(event: SceneRuntimePlaybackEnded) => void>();

  constructor(private readonly options: SceneRuntimeOptions) {}

  async start(): Promise<SceneRuntimeStatus> {
    if (this.server) return this.getStatus();
    this.server = http.createServer((request, response) => { void this.handleRequest(request, response); });
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(0, HOST, () => resolve());
    });
    this.port = (this.server.address() as AddressInfo).port;
    this.emitStatus();
    return this.getStatus();
  }

  publish(scene: unknown, avatarState: AvatarSpeechState, presentation: ScenePresentationState = createDefaultScenePresentationState()): SceneRuntimeEvent {
    const parsed = sceneRuntimePublishSchema.parse({ scene, avatarState, presentation });
    const next: SceneRuntimeState = { scene: parsed.scene, avatarState: parsed.avatarState, presentation: structuredClone(parsed.presentation) };
    const event: SceneRuntimeEvent = {
      kind: this.state ? 'patch' : 'snapshot',
      revision: ++this.revision,
      sentAt: new Date().toISOString(),
      changedKeys: changedTopLevelKeys(this.state, next),
      state: structuredClone(next),
    };
    this.state = structuredClone(next);
    this.lastPublishedAt = event.sentAt;
    for (const client of this.clients.keys()) this.writeEvent(client, event);
    this.emitStatus();
    return event;
  }

  getStatus(): SceneRuntimeStatus {
    return {
      running: this.server !== null,
      host: HOST,
      port: this.port,
      url: this.port ? `http://${HOST}:${this.port}/` : null,
      revision: this.revision,
      connectedClients: this.clients.size,
      readyClients: this.readyClients.size,
      hasScene: this.state !== null,
      lastPublishedAt: this.lastPublishedAt,
      lastReadyAt: this.lastReadyAt,
      recentLogs: this.logs.map((entry) => ({ ...entry })),
    };
  }

  subscribe(listener: (status: SceneRuntimeStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  subscribePlaybackEnded(listener: (event: SceneRuntimePlaybackEnded) => void): () => void {
    this.playbackEndedListeners.add(listener);
    return () => this.playbackEndedListeners.delete(listener);
  }

  async close(): Promise<void> {
    for (const client of this.clients.keys()) client.end();
    this.clients.clear();
    this.readyClients.clear();
    const server = this.server;
    this.server = null;
    this.port = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    this.emitStatus();
    this.listeners.clear();
    this.playbackEndedListeners.clear();
  }

  private writeEvent(response: ServerResponse, event: SceneRuntimeEvent): void {
    response.write(`id: ${event.revision}\nevent: scene\ndata: ${JSON.stringify(event)}\n\n`);
  }

  private serveFile(response: ServerResponse, filePath: string, cacheControl?: string): void {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      json(response, 404, { error: 'Not found.' });
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': cacheControl ?? (filePath.endsWith('.html') ? 'no-store' : 'public, max-age=3600'),
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(response);
  }

  private async handleRequest(request: http.IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', `http://${HOST}`);
      if (request.method === 'GET' && url.pathname === '/') return this.serveFile(response, path.join(this.options.rendererDirectory, 'index.html'), 'no-store');
      if (request.method === 'GET' && url.pathname === '/runtime.js') return this.serveFile(response, path.join(this.options.rendererDirectory, 'runtime.js'), 'no-store');
      if (request.method === 'GET' && url.pathname === '/runtime.css') return this.serveFile(response, path.join(this.options.rendererDirectory, 'runtime.css'), 'no-store');
      if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, this.getStatus());
      if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
        const assetId = decodeURIComponent(url.pathname.slice('/assets/'.length));
        const builtinPath = this.options.assets[assetId as ProjectLayerAssetId];
        const mediaPath = this.state?.scene.mediaReferences.find((reference) => reference.id === assetId)?.path;
        const assetPath = builtinPath ?? mediaPath;
        return assetPath ? this.serveFile(response, assetPath, 'no-store') : json(response, 404, { error: 'Unknown asset ID.' });
      }
      if (request.method === 'GET' && url.pathname === '/events') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        });
        response.write(': connected\n\n');
        const clientId = sceneRuntimeReadySchema.shape.clientId.safeParse(url.searchParams.get('clientId')).data ?? null;
        this.clients.set(response, clientId);
        this.emitStatus();
        if (this.state) this.writeEvent(response, { kind: 'snapshot', revision: this.revision, sentAt: new Date().toISOString(), changedKeys: ['scene', 'avatarState', 'presentation'], state: structuredClone(this.state) });
        request.once('close', () => {
          this.clients.delete(response);
          if (clientId) this.readyClients.delete(clientId);
          this.emitStatus();
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/ready') {
        const { clientId } = sceneRuntimeReadySchema.parse(await readJson(request));
        this.readyClients.add(clientId);
        this.lastReadyAt = new Date().toISOString();
        this.emitStatus();
        return json(response, 200, { ok: true, revision: this.revision });
      }
      if (request.method === 'POST' && url.pathname === '/log') {
        const parsed = sceneRuntimeLogSchema.parse(await readJson(request));
        this.logs.push({ ...parsed, timestamp: new Date().toISOString() });
        while (this.logs.length > 100) this.logs.shift();
        this.emitStatus();
        return json(response, 200, { ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/playback-ended') {
        const event = sceneRuntimePlaybackEndedSchema.parse(await readJson(request));
        const presentation = this.state?.presentation;
        // Ignore delayed browser callbacks from an old script or media node.
        if (presentation?.activeScriptId !== event.scriptId || presentation.activeLayerId !== event.layerId || presentation.playbackRevision !== event.playbackRevision) return json(response, 202, { ok: false });
        for (const listener of this.playbackEndedListeners) listener(event);
        return json(response, 200, { ok: true });
      }
      json(response, 404, { error: 'Not found.' });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : 'Invalid request.' });
    }
  }

  private emitStatus(): void {
    if (this.listeners.size === 0) return;
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }
}

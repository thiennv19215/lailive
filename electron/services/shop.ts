import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { SettingsDatabase } from './database';
import {
  SHOP_CONFIG_KEY,
  SHOP_RUNTIME_DOCUMENT_KEY,
  type ShopActionResult,
  type ShopBrowserCandidate,
  type ShopConfig,
  type ShopDiagnostic,
  type ShopOpenResult,
  type ShopProductMapping,
  type ShopRemoteProduct,
  type ShopRuntimeDocument,
  type ShopScheduleItem,
  type ShopSnapshot,
} from '../../src/shared/contracts/shop';
import { shopConfigSchema, shopMappingsSchema, shopRuntimeDocumentSchema, shopScheduleSchema } from '../../src/shared/validation/shop';
import {
  browserOwnerTokenArgument,
  createShopBrowserOwnerRecord,
  removeShopBrowserOwnerRecord,
  writeShopBrowserOwnerRecord,
  type ShopBrowserOwnerRecord,
} from './resilience';

const DEFAULT_DASHBOARD_URL = 'https://seller-vn.tiktok.com/compass/live/product';
const PRODUCT_CARD_SELECTORS = ['[data-e2e="live-product-card"]', '[data-testid="product-card"]', '[class*="product-card"]'];
const PRODUCT_TITLE_SELECTORS = ['[data-e2e="product-title"]', '[data-testid="product-title"]', '[class*="product-name"]'];
const PIN_BUTTON_SELECTORS = ['button[data-e2e="pin-product"]', 'button[data-testid="pin-product"]', 'button:has-text("Ghim")', 'button:has-text("Pin")'];

export interface ShopDashboardAdapter {
  open(config: ShopConfig, context: { profileDirectory: string; cdpPort: number; diagnosticsDirectory: string; ownerRecordPath: string }): Promise<'waiting-login' | 'ready'>;
  listProducts(): Promise<ShopRemoteProduct[]>;
  pinProduct(remoteProductId: string): Promise<void>;
  isOpen(): boolean;
  close(): Promise<void>;
}

export class MockShopDashboardAdapter implements ShopDashboardAdapter {
  private opened = false;
  private readonly products: ShopRemoteProduct[];

  constructor(products: ShopRemoteProduct[] = [
    { remoteId: 'mock-serum-m5', title: 'Serum dưỡng ẩm M5', index: 0, pinned: false, imageUrl: null },
    { remoteId: 'mock-kem-cica', title: 'Kem phục hồi Cica', index: 1, pinned: false, imageUrl: null },
    { remoteId: 'mock-son-rose', title: 'Son lì Rose 03', index: 2, pinned: false, imageUrl: null },
  ]) {
    this.products = structuredClone(products);
  }

  async open(): Promise<'ready'> { this.opened = true; return 'ready'; }
  async listProducts(): Promise<ShopRemoteProduct[]> {
    if (!this.opened) throw new Error('SHOP_BROWSER_CLOSED');
    return structuredClone(this.products);
  }
  async pinProduct(remoteProductId: string): Promise<void> {
    if (!this.opened) throw new Error('SHOP_BROWSER_CLOSED');
    const exact = this.products.filter((product) => product.remoteId === remoteProductId);
    if (exact.length !== 1) throw new Error('SHOP_PRODUCT_NOT_FOUND');
    for (const product of this.products) product.pinned = product.remoteId === remoteProductId;
  }
  isOpen(): boolean { return this.opened; }
  async close(): Promise<void> { this.opened = false; }
}

export class PlaywrightShopDashboardAdapter implements ShopDashboardAdapter {
  private process: ChildProcess | null = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private diagnosticsDirectory = '';
  private ownerRecord: ShopBrowserOwnerRecord | null = null;
  private ownerRecordPath = '';

  async open(config: ShopConfig, context: { profileDirectory: string; cdpPort: number; diagnosticsDirectory: string; ownerRecordPath: string }): Promise<'waiting-login' | 'ready'> {
    await this.close();
    shopTrace('adapter-open-start');
    this.diagnosticsDirectory = context.diagnosticsDirectory;
    this.ownerRecordPath = context.ownerRecordPath;
    fs.mkdirSync(context.profileDirectory, { recursive: true });
    fs.mkdirSync(context.diagnosticsDirectory, { recursive: true });
    const owner = createShopBrowserOwnerRecord({ pid: 1, executablePath: config.executablePath, profileDirectory: context.profileDirectory });
    const launchedProcess = spawn(config.executablePath, [
      `--user-data-dir=${context.profileDirectory}`,
      browserOwnerTokenArgument(owner.token),
      `--remote-debugging-port=${context.cdpPort}`,
      '--remote-debugging-address=127.0.0.1',
      '--no-first-run',
      '--no-default-browser-check',
      ...(process.env.AI_LIVESTREAM_SHOP_HEADLESS === '1' ? ['--headless=new', '--disable-gpu'] : []),
      config.dashboardUrl,
    ], { stdio: 'ignore', windowsHide: process.env.AI_LIVESTREAM_SHOP_HEADLESS === '1' });
    if (!launchedProcess.pid) {
      launchedProcess.kill();
      throw new Error('SHOP_BROWSER_PROCESS_MISSING');
    }
    this.process = launchedProcess;
    this.ownerRecord = { ...owner, pid: launchedProcess.pid };
    writeShopBrowserOwnerRecord(this.ownerRecordPath, this.ownerRecord);
    const launchedToken = this.ownerRecord.token;
    launchedProcess.once('exit', () => removeShopBrowserOwnerRecord(this.ownerRecordPath, launchedToken));
    try {
      await waitForCdp(context.cdpPort, 15_000);
      shopTrace('cdp-ready');
      this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${context.cdpPort}`, { timeout: 10_000 });
      shopTrace('playwright-connected');
      const contexts = this.browser.contexts();
      const pages = contexts.flatMap((browserContext) => browserContext.pages());
      this.page = pages.find((candidate) => candidate.url().startsWith(config.dashboardUrl)) ?? pages[pages.length - 1] ?? await contexts[0]?.newPage() ?? null;
      if (!this.page) throw new Error('SHOP_DASHBOARD_PAGE_MISSING');
      this.page.setDefaultTimeout(5_000);
      await this.page.goto(config.dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      shopTrace('page-loaded');
      return await this.hasProductSurface() ? 'ready' : 'waiting-login';
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async listProducts(): Promise<ShopRemoteProduct[]> {
    const page = this.requirePage();
    const cardSelector = await firstVisibleSelector(page, PRODUCT_CARD_SELECTORS);
    if (!cardSelector) throw await this.selectorError('SHOP_PRODUCT_SELECTOR_CHANGED');
    let previousCount = -1;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const count = await page.locator(cardSelector).count();
      if (count === previousCount) break;
      previousCount = count;
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForTimeout(250);
    }
    const cards = page.locator(cardSelector);
    const results = new Map<string, ShopRemoteProduct>();
    for (let index = 0; index < await cards.count(); index += 1) {
      const card = cards.nth(index);
      const remoteId = await card.getAttribute('data-product-id') ?? await card.getAttribute('data-id');
      const titleSelector = await firstVisibleSelector(card, PRODUCT_TITLE_SELECTORS);
      const title = titleSelector ? (await card.locator(titleSelector).first().innerText()).trim() : '';
      if (!remoteId || !title) continue;
      const imageUrl = await card.locator('img').first().getAttribute('src').catch(() => null);
      const pinned = await card.getAttribute('data-pinned') === 'true' || await card.locator('text=/Đang ghim|Pinned/i').count() > 0;
      results.set(remoteId, { remoteId, title, index, pinned, imageUrl: imageUrl && /^https?:\/\//.test(imageUrl) ? imageUrl : null });
    }
    if (results.size === 0) throw await this.selectorError('SHOP_PRODUCTS_EMPTY_OR_UNREADABLE');
    return [...results.values()];
  }

  async pinProduct(remoteProductId: string): Promise<void> {
    const page = this.requirePage();
    const cardSelector = await firstVisibleSelector(page, PRODUCT_CARD_SELECTORS);
    if (!cardSelector) throw await this.selectorError('SHOP_PRODUCT_SELECTOR_CHANGED');
    const cards = await page.locator(cardSelector).all();
    const exactMatches = [];
    for (const card of cards) {
      const candidateId = await card.getAttribute('data-product-id') ?? await card.getAttribute('data-id');
      if (candidateId === remoteProductId) exactMatches.push(card);
    }
    if (exactMatches.length !== 1) throw await this.selectorError('SHOP_EXACT_PRODUCT_NOT_FOUND');
    const card = exactMatches[0]!;
    const pinSelector = await firstVisibleSelector(card, PIN_BUTTON_SELECTORS);
    if (!pinSelector) throw await this.selectorError('SHOP_PIN_SELECTOR_CHANGED');
    await card.locator(pinSelector).first().click();
  }

  isOpen(): boolean { return Boolean(this.process && this.process.exitCode === null && this.browser?.isConnected() && this.page && !this.page.isClosed()); }
  async close(): Promise<void> {
    const browser = this.browser;
    const ownedProcess = this.process;
    const ownerRecord = this.ownerRecord;
    const ownerRecordPath = this.ownerRecordPath;
    this.browser = null;
    this.page = null;
    this.process = null;
    this.ownerRecord = null;
    if (browser) {
      await Promise.race([
        browser.close().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    if (ownedProcess && ownedProcess.exitCode === null) await terminateOwnedBrowserProcess(ownedProcess);
    if (ownerRecord) removeShopBrowserOwnerRecord(ownerRecordPath, ownerRecord.token);
  }

  private requirePage(): Page {
    if (!this.isOpen() || !this.page) throw new Error('SHOP_BROWSER_CLOSED');
    return this.page;
  }

  private async hasProductSurface(): Promise<boolean> {
    return Boolean(this.page && await firstVisibleSelector(this.page, PRODUCT_CARD_SELECTORS));
  }

  private async selectorError(code: string): Promise<Error> {
    if (this.page && !this.page.isClosed()) {
      const target = path.join(this.diagnosticsDirectory, `${Date.now()}-${code.toLowerCase()}.png`);
      await this.page.screenshot({ path: target, fullPage: true }).catch(() => undefined);
    }
    return new Error(code);
  }
}

async function firstVisibleSelector(root: Page | ReturnType<Page['locator']>, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) if (await root.locator(selector).count() > 0) return selector;
  return null;
}

async function waitForCdp(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('SHOP_CDP_TIMEOUT');
}

function shopTrace(stage: string): void {
  if (process.env.AI_LIVESTREAM_SHOP_TRACE === '1') process.stdout.write(`[shop-trace] ${stage}\n`);
}

async function reserveLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function terminateOwnedBrowserProcess(processToStop: ChildProcess): Promise<void> {
  if (!processToStop.pid || processToStop.exitCode !== null) return;
  if (process.platform !== 'win32') {
    processToStop.kill();
    return;
  }
  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill.exe', ['/pid', String(processToStop.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(resolve, 3_000);
    killer.once('exit', () => { clearTimeout(timer); resolve(); });
    killer.once('error', () => { clearTimeout(timer); processToStop.kill(); resolve(); });
  });
}

export function detectShopBrowsers(): ShopBrowserCandidate[] {
  const candidates = [
    { kind: 'chrome' as const, name: 'Google Chrome', executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { kind: 'chrome' as const, name: 'Google Chrome (x86)', executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
    { kind: 'edge' as const, name: 'Microsoft Edge', executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    { kind: 'edge' as const, name: 'Microsoft Edge', executablePath: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => fs.existsSync(candidate.executablePath) && !seen.has(candidate.executablePath.toLowerCase()) && seen.add(candidate.executablePath.toLowerCase()));
}

export class ShopService {
  private config: ShopConfig;
  private runtimeDocument: ShopRuntimeDocument;
  private adapter: ShopDashboardAdapter | null = null;
  private connectionState: ShopSnapshot['connectionState'] = 'closed';
  private scheduleState: ShopSnapshot['scheduleState'] = 'idle';
  private products: ShopRemoteProduct[] = [];
  private currentScheduleIndex: number | null = null;
  private nextActionAt: string | null = null;
  private cdpPort: number | null = null;
  private lastError: string | null = null;
  private diagnostic: ShopDiagnostic | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private actionGeneration = 0;
  private readonly listeners = new Set<(snapshot: ShopSnapshot) => void>();

  constructor(
    private readonly database: SettingsDatabase,
    private readonly userDataDirectory: string,
    private readonly adapterFactory: (kind: ShopConfig['kind']) => ShopDashboardAdapter = (kind) => kind === 'mock' ? new MockShopDashboardAdapter() : new PlaywrightShopDashboardAdapter(),
  ) {
    this.config = shopConfigSchema.parse(database.get<unknown>(SHOP_CONFIG_KEY)?.value ?? { kind: 'mock', executablePath: '', dashboardUrl: DEFAULT_DASHBOARD_URL });
    this.runtimeDocument = shopRuntimeDocumentSchema.parse(database.get<unknown>(SHOP_RUNTIME_DOCUMENT_KEY)?.value ?? { version: 1, mappings: [], schedule: [] });
  }

  getConfig(): ShopConfig { return structuredClone(this.config); }
  setConfig(input: ShopConfig): ShopConfig {
    const parsed = shopConfigSchema.parse(input);
    if (parsed.kind === 'playwright' && parsed.executablePath && (!path.isAbsolute(parsed.executablePath) || !fs.existsSync(parsed.executablePath))) throw new Error('SHOP_BROWSER_EXECUTABLE_NOT_FOUND');
    this.config = parsed;
    this.database.set(SHOP_CONFIG_KEY, parsed);
    return this.getConfig();
  }
  detectBrowsers(): ShopBrowserCandidate[] { return detectShopBrowsers(); }
  getSnapshot(): ShopSnapshot {
    const item = this.currentScheduleIndex === null ? null : this.runtimeDocument.schedule[this.currentScheduleIndex] ?? null;
    return {
      connectionState: this.connectionState, scheduleState: this.scheduleState, products: structuredClone(this.products),
      mappings: structuredClone(this.runtimeDocument.mappings), schedule: structuredClone(this.runtimeDocument.schedule),
      currentScheduleItemId: item?.id ?? null, currentScheduleIndex: this.currentScheduleIndex, nextActionAt: this.nextActionAt,
      cdpPort: this.cdpPort, browserOwned: this.adapter?.isOpen() ?? false, lastError: this.lastError, diagnostic: structuredClone(this.diagnostic),
    };
  }
  subscribe(listener: (snapshot: ShopSnapshot) => void): () => void { this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener); }

  async open(): Promise<ShopOpenResult> {
    await this.disconnect();
    this.connectionState = 'launching'; this.lastError = null; this.diagnostic = null; this.emit();
    try {
      const config = this.config.kind === 'playwright' && !this.config.executablePath
        ? { ...this.config, executablePath: this.detectBrowsers()[0]?.executablePath ?? '' }
        : this.config;
      if (config.kind === 'playwright' && !config.executablePath) throw new Error('SHOP_BROWSER_EXECUTABLE_NOT_FOUND');
      this.cdpPort = await reserveLoopbackPort();
      this.adapter = this.adapterFactory(config.kind);
      this.connectionState = await this.adapter.open(config, {
        profileDirectory: path.join(this.userDataDirectory, 'shop', 'tiktok-profile'),
        diagnosticsDirectory: path.join(this.userDataDirectory, 'shop', 'diagnostics'),
        ownerRecordPath: path.join(this.userDataDirectory, 'shop', 'browser-owner.json'),
        cdpPort: this.cdpPort,
      });
      if (this.connectionState === 'ready') this.products = await this.adapter.listProducts();
      this.emit();
      return { snapshot: this.getSnapshot(), message: this.connectionState === 'ready' ? 'TikTok Shop đã sẵn sàng.' : 'Trình duyệt đã mở. Hãy đăng nhập thủ công rồi làm mới sản phẩm.' };
    } catch (error) { this.fail(error); throw error; }
  }

  async refreshProducts(): Promise<ShopActionResult> {
    try {
      const adapter = this.requireAdapter();
      this.products = deduplicateProducts(await adapter.listProducts());
      this.connectionState = 'ready'; this.lastError = null; this.emit();
      return { snapshot: this.getSnapshot(), message: `Đã tải ${this.products.length} sản phẩm.` };
    } catch (error) { this.fail(error); throw error; }
  }

  setMappings(mappings: ShopProductMapping[]): ShopSnapshot { this.runtimeDocument.mappings = shopMappingsSchema.parse(mappings); this.persistRuntime(); return this.getSnapshot(); }
  setSchedule(schedule: ShopScheduleItem[]): ShopSnapshot { this.stopScheduleInternal(); this.runtimeDocument.schedule = shopScheduleSchema.parse(schedule); this.persistRuntime(); return this.getSnapshot(); }

  async pinProduct(remoteProductId: string): Promise<ShopActionResult> {
    if (!this.products.some((product) => product.remoteId === remoteProductId)) throw new Error('SHOP_PRODUCT_NOT_IN_CURRENT_LIST');
    try {
      await this.requireAdapter().pinProduct(remoteProductId);
      this.products = this.products.map((product) => ({ ...product, pinned: product.remoteId === remoteProductId }));
      this.connectionState = 'ready'; this.lastError = null; this.diagnostic = null; this.emit();
      return { snapshot: this.getSnapshot(), message: 'Đã ghim đúng sản phẩm đã chọn.' };
    } catch (error) { this.fail(error); throw error; }
  }

  async startSchedule(): Promise<ShopActionResult> {
    if (this.connectionState !== 'ready') throw new Error('SHOP_NOT_READY');
    if (this.runtimeDocument.schedule.length === 0) throw new Error('SHOP_SCHEDULE_EMPTY');
    this.stopScheduleInternal(); this.scheduleState = 'running'; this.currentScheduleIndex = 0; this.emit();
    await this.runCurrentScheduleItem(this.actionGeneration);
    return { snapshot: this.getSnapshot(), message: 'Lịch ghim đã bắt đầu.' };
  }
  pauseSchedule(): ShopActionResult { if (this.scheduleState !== 'running') throw new Error('SHOP_SCHEDULE_NOT_RUNNING'); this.clearTimer(); this.scheduleState = 'paused'; this.nextActionAt = null; this.emit(); return { snapshot: this.getSnapshot(), message: 'Đã tạm dừng lịch ghim.' }; }
  async resumeSchedule(): Promise<ShopActionResult> { if (this.scheduleState !== 'paused' || this.currentScheduleIndex === null) throw new Error('SHOP_SCHEDULE_NOT_PAUSED'); this.scheduleState = 'running'; this.emit(); await this.runCurrentScheduleItem(this.actionGeneration); return { snapshot: this.getSnapshot(), message: 'Đã tiếp tục lịch ghim.' }; }
  async skipScheduleItem(): Promise<ShopActionResult> { if (!['running', 'paused'].includes(this.scheduleState)) throw new Error('SHOP_SCHEDULE_INACTIVE'); this.clearTimer(); this.advanceSchedule(); if (this.scheduleState === 'running') await this.runCurrentScheduleItem(this.actionGeneration); return { snapshot: this.getSnapshot(), message: 'Đã bỏ qua sản phẩm hiện tại.' }; }
  stopSchedule(): ShopActionResult { this.stopScheduleInternal(); this.emit(); return { snapshot: this.getSnapshot(), message: 'Đã dừng lịch ghim ngay lập tức.' }; }

  async disconnect(): Promise<ShopSnapshot> {
    this.stopScheduleInternal();
    await this.adapter?.close();
    this.adapter = null; this.connectionState = 'closed'; this.products = []; this.cdpPort = null; this.lastError = null; this.emit();
    return this.getSnapshot();
  }
  async close(): Promise<void> { await this.disconnect(); this.listeners.clear(); }

  private async runCurrentScheduleItem(generation: number): Promise<void> {
    const item = this.currentScheduleIndex === null ? null : this.runtimeDocument.schedule[this.currentScheduleIndex];
    if (!item || this.scheduleState !== 'running' || generation !== this.actionGeneration) return;
    let lastError: unknown;
    for (let attempt = 0; attempt <= item.retryCount; attempt += 1) {
      if (generation !== this.actionGeneration || this.scheduleState !== 'running') return;
      try { await this.pinProduct(item.remoteProductId); lastError = null; break; } catch (error) { lastError = error; }
    }
    if (lastError) { this.scheduleState = 'error'; this.clearTimer(); this.emit(); return; }
    this.nextActionAt = new Date(Date.now() + item.durationSeconds * 1000).toISOString(); this.emit();
    this.timer = setTimeout(() => {
      if (generation !== this.actionGeneration || this.scheduleState !== 'running') return;
      this.advanceSchedule();
      void this.runCurrentScheduleItem(generation);
    }, item.durationSeconds * 1000);
  }
  private advanceSchedule(): void { if (this.currentScheduleIndex === null) return; this.currentScheduleIndex = (this.currentScheduleIndex + 1) % this.runtimeDocument.schedule.length; this.nextActionAt = null; this.emit(); }
  private stopScheduleInternal(): void { this.actionGeneration += 1; this.clearTimer(); this.scheduleState = 'idle'; this.currentScheduleIndex = null; this.nextActionAt = null; }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private requireAdapter(): ShopDashboardAdapter { if (!this.adapter?.isOpen()) { this.connectionState = 'error'; this.lastError = 'SHOP_BROWSER_CLOSED'; this.emit(); throw new Error('SHOP_BROWSER_CLOSED'); } return this.adapter; }
  private persistRuntime(): void { this.database.set(SHOP_RUNTIME_DOCUMENT_KEY, this.runtimeDocument); this.emit(); }
  private fail(error: unknown): void {
    const code = error instanceof Error ? error.message : 'SHOP_UNKNOWN_ERROR';
    const screenshotDirectory = path.join(this.userDataDirectory, 'shop', 'diagnostics');
    const screenshots = fs.existsSync(screenshotDirectory) ? fs.readdirSync(screenshotDirectory).filter((file) => file.endsWith('.png')).sort() : [];
    const screenshot = screenshots[screenshots.length - 1];
    this.connectionState = 'error'; this.lastError = code;
    this.diagnostic = { code, message: recoveryMessage(code), screenshotPath: screenshot ? path.join(screenshotDirectory, screenshot) : null, capturedAt: new Date().toISOString() };
    this.emit();
  }
  private emit(): void { const snapshot = this.getSnapshot(); for (const listener of this.listeners) listener(snapshot); }
}

function deduplicateProducts(products: ShopRemoteProduct[]): ShopRemoteProduct[] {
  const unique = new Map<string, ShopRemoteProduct>();
  for (const product of products) if (!unique.has(product.remoteId)) unique.set(product.remoteId, product);
  return [...unique.values()].sort((a, b) => a.index - b.index);
}

function recoveryMessage(code: string): string {
  if (code === 'SHOP_BROWSER_CLOSED') return 'Trình duyệt Shop đã đóng. Mở lại profile riêng của ứng dụng rồi thử lại.';
  if (code.includes('SELECTOR') || code.includes('UNREADABLE')) return 'TikTok Shop có thể đã đổi giao diện. Xem ảnh chẩn đoán và cập nhật selector trước khi thử lại.';
  if (code === 'SHOP_BROWSER_EXECUTABLE_NOT_FOUND') return 'Không tìm thấy Chrome/Edge. Chọn đúng tệp thực thi trong cấu hình Shop.';
  if (code === 'SHOP_CDP_TIMEOUT') return 'Không kết nối được cổng điều khiển của profile riêng. Đóng cửa sổ Shop và mở lại.';
  return 'Không thể hoàn tất thao tác Shop. Kiểm tra đăng nhập, cửa sổ trình duyệt và thử lại.';
}

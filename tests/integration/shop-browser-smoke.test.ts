import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SettingsDatabase } from '../../electron/services/database';
import { ShopService, detectShopBrowsers } from '../../electron/services/shop';

const fixtureHtml = `<!doctype html><html><body>
  <article data-e2e="live-product-card" data-product-id="fixture-1" data-pinned="false">
    <strong data-e2e="product-title">Serum Fixture M5</strong><button data-e2e="pin-product">Ghim</button>
  </article>
  <article data-e2e="live-product-card" data-product-id="fixture-10" data-pinned="false">
    <strong data-e2e="product-title">Serum Fixture M5 Plus</strong><button data-e2e="pin-product">Ghim</button>
  </article>
  <script>for (const button of document.querySelectorAll('button')) button.addEventListener('click', () => {
    for (const card of document.querySelectorAll('[data-product-id]')) card.dataset.pinned = 'false';
    button.closest('[data-product-id]').dataset.pinned = 'true';
  });</script>
</body></html>`;

function fakeDatabase(): SettingsDatabase {
  const records = new Map<string, unknown>();
  return {
    get: (key: string) => records.has(key) ? { key, value: records.get(key), updatedAt: new Date().toISOString() } : null,
    set: (key: string, value: unknown) => { records.set(key, structuredClone(value)); return { key, value, updatedAt: new Date().toISOString() }; },
  } as unknown as SettingsDatabase;
}

describe('Shop dedicated-browser smoke', () => {
  let server: http.Server;
  let service: ShopService | null = null;
  let temporaryRoot = '';
  const previousHeadless = process.env.AI_LIVESTREAM_SHOP_HEADLESS;

  beforeAll(async () => {
    await cleanupSmokeDirectories();
    server = http.createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(request.url === '/broken' ? '<!doctype html><html><body><main>Fixture without known Shop selectors</main></body></html>' : fixtureHtml);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-live-shop-smoke-'));
    process.env.AI_LIVESTREAM_SHOP_HEADLESS = '1';
  });

  afterAll(async () => {
    await service?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousHeadless === undefined) delete process.env.AI_LIVESTREAM_SHOP_HEADLESS;
    else process.env.AI_LIVESTREAM_SHOP_HEADLESS = previousHeadless;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await cleanupSmokeDirectories();
  });

  it('launches only a fresh profile, connects over loopback CDP, reads products, pins the exact ID, and closes it', async () => {
    const browser = detectShopBrowsers()[0];
    expect(browser, 'Chrome or Edge is required for the local Shop smoke').toBeDefined();
    const port = (server.address() as AddressInfo).port;
    service = new ShopService(fakeDatabase(), path.join(temporaryRoot, 'success-case'));
    service.setConfig({ kind: 'playwright', executablePath: browser!.executablePath, dashboardUrl: `http://127.0.0.1:${port}/` });

    const opened = await withTimeout(service.open(), 30_000, 'SHOP_SMOKE_OPEN_TIMEOUT');
    expect(opened.snapshot).toMatchObject({ connectionState: 'ready', browserOwned: true });
    expect(opened.snapshot.products.map((product) => product.remoteId)).toEqual(['fixture-1', 'fixture-10']);
    await withTimeout(service.pinProduct('fixture-1'), 5_000, 'SHOP_SMOKE_PIN_TIMEOUT');
    expect(service.getSnapshot().products).toEqual([
      expect.objectContaining({ remoteId: 'fixture-1', pinned: true }),
      expect.objectContaining({ remoteId: 'fixture-10', pinned: false }),
    ]);
    await expect(service.pinProduct('fixture')).rejects.toThrow('SHOP_PRODUCT_NOT_IN_CURRENT_LIST');
    await withTimeout(service.disconnect(), 8_000, 'SHOP_SMOKE_DISCONNECT_TIMEOUT');
    expect(service.getSnapshot()).toMatchObject({ connectionState: 'closed', browserOwned: false, cdpPort: null });
    expect(fs.existsSync(path.join(temporaryRoot, 'success-case', 'shop', 'browser-owner.json'))).toBe(false);
  }, 45_000);

  it('captures a controlled diagnostic screenshot when product selectors no longer match', async () => {
    const browser = detectShopBrowsers()[0];
    expect(browser, 'Chrome or Edge is required for the local Shop smoke').toBeDefined();
    const port = (server.address() as AddressInfo).port;
    const diagnosticRoot = path.join(temporaryRoot, 'diagnostic-case');
    service = new ShopService(fakeDatabase(), diagnosticRoot);
    service.setConfig({ kind: 'playwright', executablePath: browser!.executablePath, dashboardUrl: `http://127.0.0.1:${port}/broken` });

    const opened = await withTimeout(service.open(), 30_000, 'SHOP_DIAGNOSTIC_OPEN_TIMEOUT');
    expect(opened.snapshot).toMatchObject({ connectionState: 'waiting-login', products: [] });
    await expect(withTimeout(service.refreshProducts(), 10_000, 'SHOP_DIAGNOSTIC_REFRESH_TIMEOUT')).rejects.toThrow('SHOP_PRODUCT_SELECTOR_CHANGED');
    const diagnostic = service.getSnapshot().diagnostic;
    expect(diagnostic).toMatchObject({ code: 'SHOP_PRODUCT_SELECTOR_CHANGED', message: expect.stringContaining('đổi giao diện') });
    expect(diagnostic?.screenshotPath).toBeTruthy();
    expect(path.resolve(diagnostic!.screenshotPath!)).toContain(path.resolve(diagnosticRoot));
    expect(fs.existsSync(diagnostic!.screenshotPath!)).toBe(true);
    await withTimeout(service.disconnect(), 8_000, 'SHOP_DIAGNOSTIC_DISCONNECT_TIMEOUT');
  }, 45_000);
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(code)), timeoutMs)),
  ]);
}

async function cleanupSmokeDirectories(): Promise<void> {
  const temporaryDirectory = path.resolve(os.tmpdir());
  for (const entry of fs.readdirSync(temporaryDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('ai-live-shop-smoke-')) continue;
    const target = path.resolve(temporaryDirectory, entry.name);
    if (!target.startsWith(temporaryDirectory) || !path.basename(target).startsWith('ai-live-shop-smoke-')) continue;
    await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 }).catch(() => undefined);
  }
}

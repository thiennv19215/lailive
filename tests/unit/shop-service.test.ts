import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDatabase } from '../../electron/services/database';
import { ShopService, type ShopDashboardAdapter } from '../../electron/services/shop';
import { SHOP_CONFIG_KEY, SHOP_RUNTIME_DOCUMENT_KEY, type ShopConfig, type ShopRemoteProduct } from '../../src/shared/contracts/shop';
import { shopConfigSchema, shopMappingsSchema, shopScheduleSchema } from '../../src/shared/validation/shop';

function fakeDatabase(): { database: SettingsDatabase; records: Map<string, unknown> } {
  const records = new Map<string, unknown>();
  return {
    records,
    database: {
      get: (key: string) => records.has(key) ? { key, value: records.get(key), updatedAt: new Date().toISOString() } : null,
      set: (key: string, value: unknown) => { records.set(key, structuredClone(value)); return { key, value, updatedAt: new Date().toISOString() }; },
    } as unknown as SettingsDatabase,
  };
}

class TrackingAdapter implements ShopDashboardAdapter {
  opened = false;
  pinAttempts: string[] = [];
  failures = new Map<string, number>();
  constructor(readonly products: ShopRemoteProduct[], private readonly openState: 'waiting-login' | 'ready' = 'ready') {}
  async open(): Promise<'waiting-login' | 'ready'> { this.opened = true; return this.openState; }
  async listProducts(): Promise<ShopRemoteProduct[]> { if (!this.opened) throw new Error('SHOP_BROWSER_CLOSED'); return structuredClone(this.products); }
  async pinProduct(remoteProductId: string): Promise<void> {
    if (!this.opened) throw new Error('SHOP_BROWSER_CLOSED');
    this.pinAttempts.push(remoteProductId);
    const remaining = this.failures.get(remoteProductId) ?? 0;
    if (remaining > 0) { this.failures.set(remoteProductId, remaining - 1); throw new Error('SHOP_PIN_TEMPORARY_FAILURE'); }
    if (!this.products.some((product) => product.remoteId === remoteProductId)) throw new Error('SHOP_PRODUCT_NOT_FOUND');
  }
  isOpen(): boolean { return this.opened; }
  async close(): Promise<void> { this.opened = false; }
}

const products: ShopRemoteProduct[] = [
  { remoteId: 'remote-1', title: 'Serum M5', index: 0, pinned: false, imageUrl: null },
  { remoteId: 'remote-10', title: 'Serum M5 Plus', index: 1, pinned: false, imageUrl: null },
];
const config: ShopConfig = { kind: 'mock', executablePath: '', dashboardUrl: 'https://seller-vn.tiktok.com/compass/live/product' };

afterEach(() => vi.useRealTimers());

describe('ShopService', () => {
  it('persists only public config plus mappings/schedule and restores them after renderer/service recreation', () => {
    const { database, records } = fakeDatabase();
    const service = new ShopService(database, 'C:\\temp\\shop-test');
    expect(service.setConfig(config)).toEqual(config);
    service.setMappings([{ remoteProductId: 'remote-1', localProductId: 'local-1' }]);
    service.setSchedule([{ id: 'slot-1', remoteProductId: 'remote-1', localProductId: 'local-1', title: 'Serum M5', durationSeconds: 30, retryCount: 2 }]);
    expect(records.get(SHOP_CONFIG_KEY)).toEqual(config);
    expect(records.get(SHOP_RUNTIME_DOCUMENT_KEY)).toMatchObject({ version: 1, mappings: [{ remoteProductId: 'remote-1', localProductId: 'local-1' }] });

    const restarted = new ShopService(database, 'C:\\temp\\shop-test');
    expect(restarted.getSnapshot()).toMatchObject({ scheduleState: 'idle', currentScheduleIndex: null, mappings: [{ localProductId: 'local-1' }], schedule: [{ id: 'slot-1' }] });
  });

  it('preserves signed-out waiting-login state without claiming products are available', async () => {
    const { database } = fakeDatabase();
    const adapter = new TrackingAdapter(products, 'waiting-login');
    const service = new ShopService(database, 'C:\\temp\\shop-test', () => adapter);
    const result = await service.open();
    expect(result.snapshot).toMatchObject({ connectionState: 'waiting-login', products: [], browserOwned: true });
    expect(result.message).toContain('đăng nhập thủ công');
  });

  it('pins by exact remote ID even when names and IDs are similar', async () => {
    const { database } = fakeDatabase();
    const adapter = new TrackingAdapter(products);
    const service = new ShopService(database, 'C:\\temp\\shop-test', () => adapter);
    await service.open();
    await service.pinProduct('remote-1');
    expect(adapter.pinAttempts).toEqual(['remote-1']);
    expect(service.getSnapshot().products).toEqual([
      expect.objectContaining({ remoteId: 'remote-1', pinned: true }),
      expect.objectContaining({ remoteId: 'remote-10', pinned: false }),
    ]);
    await expect(service.pinProduct('remote')).rejects.toThrow('SHOP_PRODUCT_NOT_IN_CURRENT_LIST');
  });

  it('runs retry, pause, resume, skip, wraparound and immediate stop without leaving timers active', async () => {
    vi.useFakeTimers();
    const { database } = fakeDatabase();
    const adapter = new TrackingAdapter(products);
    adapter.failures.set('remote-1', 1);
    const service = new ShopService(database, 'C:\\temp\\shop-test', () => adapter);
    await service.open();
    service.setSchedule([
      { id: 'slot-1', remoteProductId: 'remote-1', localProductId: null, title: 'Serum M5', durationSeconds: 5, retryCount: 1 },
      { id: 'slot-2', remoteProductId: 'remote-10', localProductId: null, title: 'Serum M5 Plus', durationSeconds: 5, retryCount: 0 },
    ]);
    await service.startSchedule();
    expect(adapter.pinAttempts).toEqual(['remote-1', 'remote-1']);
    expect(service.getSnapshot()).toMatchObject({ scheduleState: 'running', currentScheduleItemId: 'slot-1' });

    service.pauseSchedule();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(adapter.pinAttempts).toHaveLength(2);
    await service.resumeSchedule();
    await service.skipScheduleItem();
    expect(adapter.pinAttempts[adapter.pinAttempts.length - 1]).toBe('remote-10');
    const attemptsBeforeStop = adapter.pinAttempts.length;
    service.stopSchedule();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(adapter.pinAttempts).toHaveLength(attemptsBeforeStop);
    expect(service.getSnapshot()).toMatchObject({ scheduleState: 'idle', currentScheduleItemId: null, nextActionAt: null });
  });

  it('rejects unsafe dashboard protocols, duplicate mappings, and duplicate schedule IDs', () => {
    expect(() => shopConfigSchema.parse({ ...config, dashboardUrl: 'file:///C:/secret.html' })).toThrow();
    expect(() => shopMappingsSchema.parse([
      { remoteProductId: 'remote-1', localProductId: 'local-1' },
      { remoteProductId: 'remote-1', localProductId: 'local-2' },
    ])).toThrow();
    expect(() => shopScheduleSchema.parse([
      { id: 'same', remoteProductId: 'remote-1', localProductId: null, title: 'One', durationSeconds: 5, retryCount: 0 },
      { id: 'same', remoteProductId: 'remote-10', localProductId: null, title: 'Two', durationSeconds: 5, retryCount: 0 },
    ])).toThrow();
  });

  it('turns browser closure into actionable recovery state', async () => {
    const { database } = fakeDatabase();
    const adapter = new TrackingAdapter(products);
    const service = new ShopService(database, 'C:\\temp\\shop-test', () => adapter);
    await service.open();
    await adapter.close();
    await expect(service.refreshProducts()).rejects.toThrow('SHOP_BROWSER_CLOSED');
    expect(service.getSnapshot()).toMatchObject({
      connectionState: 'error',
      lastError: 'SHOP_BROWSER_CLOSED',
      diagnostic: { code: 'SHOP_BROWSER_CLOSED', message: expect.stringContaining('Mở lại profile riêng') },
    });
  });
});

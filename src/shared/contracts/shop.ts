export const SHOP_CONFIG_KEY = 'app.shop-config';
export const SHOP_RUNTIME_DOCUMENT_KEY = 'app.shop-runtime-document';

export type ShopAdapterKind = 'mock' | 'playwright';
export type ShopBrowserKind = 'chrome' | 'edge' | 'custom';
export type ShopConnectionState = 'closed' | 'launching' | 'waiting-login' | 'ready' | 'error';
export type ShopScheduleState = 'idle' | 'running' | 'paused' | 'error';

export interface ShopBrowserCandidate {
  kind: ShopBrowserKind;
  name: string;
  executablePath: string;
}

export interface ShopConfig {
  kind: ShopAdapterKind;
  executablePath: string;
  dashboardUrl: string;
}

export interface ShopRemoteProduct {
  remoteId: string;
  title: string;
  index: number;
  pinned: boolean;
  imageUrl: string | null;
}

export interface ShopProductMapping {
  remoteProductId: string;
  localProductId: string;
}

export interface ShopScheduleItem {
  id: string;
  remoteProductId: string;
  localProductId: string | null;
  title: string;
  durationSeconds: number;
  retryCount: number;
}

export interface ShopDiagnostic {
  code: string;
  message: string;
  screenshotPath: string | null;
  capturedAt: string;
}

export interface ShopSnapshot {
  connectionState: ShopConnectionState;
  scheduleState: ShopScheduleState;
  products: ShopRemoteProduct[];
  mappings: ShopProductMapping[];
  schedule: ShopScheduleItem[];
  currentScheduleItemId: string | null;
  currentScheduleIndex: number | null;
  nextActionAt: string | null;
  cdpPort: number | null;
  browserOwned: boolean;
  lastError: string | null;
  diagnostic: ShopDiagnostic | null;
}

export interface ShopOpenResult {
  snapshot: ShopSnapshot;
  message: string;
}

export interface ShopActionResult {
  snapshot: ShopSnapshot;
  message: string;
}

export interface ShopRuntimeDocument {
  version: 1;
  mappings: ShopProductMapping[];
  schedule: ShopScheduleItem[];
}


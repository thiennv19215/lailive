import type { ProjectMediaReference } from './projects';

export const PRODUCT_CATALOG_FORMAT = 'ai-livestream-products' as const;
export const PRODUCT_CATALOG_VERSION = 1 as const;
export const DEFAULT_PRODUCT_MATCH_THRESHOLD = 160;
export const EXACT_PRODUCT_NAME_SCORE = 1000;

export interface ProductCatalogItem {
  id: string;
  name: string;
  tiktokProductId: string;
  tiktokIndex: number | null;
  price: string;
  description: string;
  sellingPoints: string[];
  media: ProjectMediaReference[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCatalogEnvelope {
  format: typeof PRODUCT_CATALOG_FORMAT;
  version: typeof PRODUCT_CATALOG_VERSION;
  exportedAt: string;
  products: ProductCatalogItem[];
}

export interface ProductMatchCandidate {
  product: ProductCatalogItem;
  score: number;
  exactName: boolean;
  matchedTokens: string[];
  matchedPhrases: string[];
}

export interface ProductMatchResult {
  normalizedComment: string;
  threshold: number;
  match: ProductMatchCandidate | null;
  candidates: ProductMatchCandidate[];
}

import { z } from 'zod';
import { PRODUCT_CATALOG_FORMAT, PRODUCT_CATALOG_VERSION } from '../contracts/products';

const productIdSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9_-]*$/i);
const productMediaReferenceSchema = z.object({
  id: productIdSchema,
  label: z.string().trim().min(1).max(120),
  kind: z.enum(['image', 'video', 'audio']),
  path: z.string().trim().min(1).max(2048).refine(
    (value) => /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value),
    'Media path must be absolute.',
  ),
});

export const productCatalogItemSchema = z.object({
  id: productIdSchema,
  name: z.string().trim().min(1).max(160),
  tiktokProductId: z.string().trim().max(120),
  tiktokIndex: z.number().int().min(0).max(1_000_000).nullable(),
  price: z.string().trim().max(80),
  description: z.string().trim().max(4000),
  sellingPoints: z.array(z.string().trim().min(1).max(500)).max(30),
  media: z.array(productMediaReferenceSchema).max(30),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const productCatalogSchema = z.array(productCatalogItemSchema).max(1000).refine(
  (products) => new Set(products.map((product) => product.id)).size === products.length,
  'Product IDs must be unique.',
);

export const productCatalogEnvelopeSchema = z.object({
  format: z.literal(PRODUCT_CATALOG_FORMAT),
  version: z.literal(PRODUCT_CATALOG_VERSION),
  exportedAt: z.iso.datetime(),
  products: productCatalogSchema,
});

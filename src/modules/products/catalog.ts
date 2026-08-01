import { PRODUCT_CATALOG_FORMAT, PRODUCT_CATALOG_VERSION, type ProductCatalogEnvelope, type ProductCatalogItem } from '../../shared/contracts/products';
import { productCatalogEnvelopeSchema, productCatalogItemSchema, productCatalogSchema } from '../../shared/validation/products';

export function createProduct(input: Partial<ProductCatalogItem> & Pick<ProductCatalogItem, 'id' | 'name'>, now = new Date()): ProductCatalogItem {
  const timestamp = now.toISOString();
  return productCatalogItemSchema.parse({
    tiktokProductId: '',
    tiktokIndex: null,
    price: '',
    description: '',
    sellingPoints: [],
    media: [],
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  });
}

export function upsertProduct(products: ProductCatalogItem[], product: ProductCatalogItem): ProductCatalogItem[] {
  const parsedProducts = productCatalogSchema.parse(products);
  const parsedProduct = productCatalogItemSchema.parse(product);
  const existingIndex = parsedProducts.findIndex((candidate) => candidate.id === parsedProduct.id);
  if (existingIndex === -1) return productCatalogSchema.parse([...parsedProducts, parsedProduct]);
  return productCatalogSchema.parse(parsedProducts.map((candidate, index) => index === existingIndex ? parsedProduct : candidate));
}

export function deleteProduct(products: ProductCatalogItem[], id: string): ProductCatalogItem[] {
  return productCatalogSchema.parse(products).filter((product) => product.id !== id);
}

export function exportProductCatalog(products: ProductCatalogItem[], now = new Date()): ProductCatalogEnvelope {
  return productCatalogEnvelopeSchema.parse({
    format: PRODUCT_CATALOG_FORMAT,
    version: PRODUCT_CATALOG_VERSION,
    exportedAt: now.toISOString(),
    products,
  });
}

export function importProductCatalog(input: string | unknown): ProductCatalogItem[] {
  const value = typeof input === 'string' ? JSON.parse(input) as unknown : input;
  return productCatalogEnvelopeSchema.parse(value).products;
}

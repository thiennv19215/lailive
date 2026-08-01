import { foldVietnamese } from '../triggers/moderation-engine';
import { DEFAULT_PRODUCT_MATCH_THRESHOLD, EXACT_PRODUCT_NAME_SCORE, type ProductCatalogItem, type ProductMatchCandidate, type ProductMatchResult } from '../../shared/contracts/products';
import { productCatalogSchema } from '../../shared/validation/products';

export function normalizeProductText(value: string): string {
  return foldVietnamese(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueTokens(value: string): string[] {
  return [...new Set(value.split(' ').filter((token) => token.length >= 2))];
}

function phrases(tokens: string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) result.push(`${tokens[index]} ${tokens[index + 1]}`);
  return result;
}

export function scoreProduct(comment: string, product: ProductCatalogItem): ProductMatchCandidate {
  const normalizedComment = normalizeProductText(comment);
  const normalizedName = normalizeProductText(product.name);
  const commentPadded = ` ${normalizedComment} `;
  const exactName = normalizedName.length > 0 && commentPadded.includes(` ${normalizedName} `);
  const nameTokens = uniqueTokens(normalizedName);
  const commentTokens = new Set(uniqueTokens(normalizedComment));
  const matchedTokens = nameTokens.filter((token) => commentTokens.has(token));
  const matchedPhrases = phrases(nameTokens).filter((phrase) => commentPadded.includes(` ${phrase} `));
  let score = exactName ? EXACT_PRODUCT_NAME_SCORE : matchedTokens.length * 120 + matchedPhrases.length * 90;
  if (!exactName && nameTokens.length > 0 && matchedTokens.length === nameTokens.length) score += 200;
  return { product, score, exactName, matchedTokens, matchedPhrases };
}

export function matchProduct(comment: string, products: ProductCatalogItem[], threshold = DEFAULT_PRODUCT_MATCH_THRESHOLD): ProductMatchResult {
  const normalizedComment = normalizeProductText(comment);
  const candidates = productCatalogSchema.parse(products)
    .filter((product) => product.enabled)
    .map((product) => scoreProduct(comment, product))
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, 'vi'))
    .slice(0, 5);
  const best = candidates[0];
  return {
    normalizedComment,
    threshold,
    match: best && best.score >= threshold ? best : null,
    candidates,
  };
}

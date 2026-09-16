import type { Platform, ProductDefinition, RegionCode, RegionMeta } from '@/types/dropke';

export const platforms: Platform[] = ['PlayStation', 'Xbox', 'Nintendo', 'PC'];

export const regions: Record<RegionCode, RegionMeta> = {
  US: { code: 'US', name: 'USA', currency: 'USD', symbol: '$' },
  UK: { code: 'UK', name: 'United Kingdom', currency: 'GBP', symbol: '£' },
  ZA: { code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R' },
  AE: { code: 'AE', name: 'UAE', currency: 'AED', symbol: 'AED ' },
  IN: { code: 'IN', name: 'India', currency: 'INR', symbol: '₹' },
};

export const walletDenominations: Record<RegionCode, number[]> = {
  US: [10, 25, 50, 100],
  UK: [10, 20, 50, 100],
  ZA: [100, 250, 500, 1000],
  AE: [50, 100, 200, 400],
  IN: [500, 1000, 2000, 5000],
};

export const products: ProductDefinition[] = [
  {
    id: 'vb800',
    name: '800 V-Bucks',
    shortName: '800',
    description: 'A quick Fortnite top-up.',
    kind: 'vbucks',
    storePrices: { US: 8.99, UK: 6.99, ZA: 89.99, AE: 36.99, IN: 749 },
  },
  {
    id: 'vb2400',
    name: '2,400 V-Bucks',
    shortName: '2,400',
    description: 'The most popular DROPKE top-up.',
    kind: 'vbucks',
    storePrices: { US: 22.99, UK: 17.49, ZA: 239.99, AE: 89.99, IN: 1999 },
  },
  {
    id: 'vb4500',
    name: '4,500 V-Bucks',
    shortName: '4,500',
    description: 'More room for bundles and cosmetics.',
    kind: 'vbucks',
    storePrices: { US: 36.99, UK: 29.49, ZA: 399.99, AE: 149.99, IN: 3199 },
  },
  {
    id: 'vb12500',
    name: '12,500 V-Bucks',
    shortName: '12,500',
    description: 'Large Fortnite wallet top-up.',
    kind: 'vbucks',
    storePrices: { US: 89.99, UK: 69.99, ZA: 999.99, AE: 369.99, IN: 7499 },
  },
  {
    id: 'crew',
    name: 'Fortnite Crew',
    shortName: 'Crew',
    description: 'Credit matched for your monthly Fortnite Crew subscription.',
    kind: 'crew',
    storePrices: { US: 11.99, UK: 9.99, ZA: 119.99, AE: 44.99, IN: 999 },
  },
  {
    id: 'pack1',
    name: 'Featured Fortnite Pack',
    shortName: 'Featured Pack',
    description: 'Credit matched to a featured Fortnite pack.',
    kind: 'pack',
    storePrices: { US: 15.99, UK: 12.99, ZA: 179.99, AE: 59.99, IN: 1299 },
  },
  {
    id: 'pack2',
    name: 'Fortnite Quest Pack',
    shortName: 'Quest Pack',
    description: 'Credit matched to a quest or challenge pack.',
    kind: 'pack',
    storePrices: { US: 14.99, UK: 11.99, ZA: 169.99, AE: 54.99, IN: 1199 },
  },
  {
    id: 'pack3',
    name: 'Fortnite Bundle',
    shortName: 'Bundle',
    description: 'Credit matched to a larger Fortnite bundle.',
    kind: 'pack',
    storePrices: { US: 19.99, UK: 15.99, ZA: 219.99, AE: 74.99, IN: 1599 },
  },
  {
    id: 'custom',
    name: 'Other Fortnite Purchase',
    shortName: 'Other purchase',
    description: 'Enter the store price and DROPKE will match the wallet credit.',
    kind: 'custom',
  },
];

export const productById = Object.fromEntries(products.map((product) => [product.id, product])) as Record<string, ProductDefinition>;

export function isPlatform(value: unknown): value is Platform {
  return platforms.includes(String(value) as Platform);
}

export function isRegionCode(value: unknown): value is RegionCode {
  return ['US', 'UK', 'ZA', 'AE', 'IN'].includes(String(value));
}

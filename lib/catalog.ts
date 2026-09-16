import type { Platform, ProductDefinition, RegionCode } from '@/types/dropke';

export const allPlatforms: Platform[] = ['PlayStation', 'Xbox', 'Nintendo', 'PC'];
export const platforms = allPlatforms;
export const allRegionCodes: RegionCode[] = ['US', 'UK', 'ZA', 'AE', 'IN', 'BR'];

export const currencySymbols: Record<string, string> = {
  USD: '$',
  GBP: '£',
  ZAR: 'R',
  AED: 'AED ',
  INR: '₹',
  BRL: 'R$',
};

export function currencySymbol(currency: string) {
  return currencySymbols[currency] ?? `${currency} `;
}

// Display-only fallback metadata. Commercial availability, product prices and
// wallet routing now come from Supabase rather than this file.
export const regions: Record<RegionCode, { code: RegionCode; name: string; currency: string; symbol: string }> = {
  US: { code: 'US', name: 'USA', currency: 'USD', symbol: '$' },
  UK: { code: 'UK', name: 'United Kingdom', currency: 'GBP', symbol: '£' },
  ZA: { code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R' },
  AE: { code: 'AE', name: 'UAE', currency: 'USD', symbol: '$' },
  IN: { code: 'IN', name: 'India', currency: 'INR', symbol: '₹' },
  BR: { code: 'BR', name: 'Brazil', currency: 'BRL', symbol: 'R$' },
};

export const products: ProductDefinition[] = [
  { id: 'vb800', name: '800 V-Bucks', shortName: '800', description: 'A quick Fortnite top-up.', kind: 'vbucks', vbucksAmount: 800 },
  { id: 'vb2400', name: '2,400 V-Bucks', shortName: '2,400', description: 'The most popular DROPKE top-up.', kind: 'vbucks', vbucksAmount: 2400 },
  { id: 'vb4500', name: '4,500 V-Bucks', shortName: '4,500', description: 'More room for bundles and cosmetics.', kind: 'vbucks', vbucksAmount: 4500 },
  { id: 'vb12500', name: '12,500 V-Bucks', shortName: '12,500', description: 'Large Fortnite wallet top-up.', kind: 'vbucks', vbucksAmount: 12500 },
  { id: 'crew', name: 'Fortnite Crew', shortName: 'Crew', description: 'Credit matched for your monthly Fortnite Crew subscription.', kind: 'crew' },
  { id: 'pack1', name: 'Featured Fortnite Pack', shortName: 'Featured Pack', description: 'Credit matched to a featured Fortnite pack.', kind: 'pack' },
  { id: 'pack2', name: 'Fortnite Quest Pack', shortName: 'Quest Pack', description: 'Credit matched to a quest or challenge pack.', kind: 'pack' },
  { id: 'pack3', name: 'Fortnite Bundle', shortName: 'Bundle', description: 'Credit matched to a larger Fortnite bundle.', kind: 'pack' },
  { id: 'custom', name: 'Other Fortnite Purchase', shortName: 'Other purchase', description: 'Enter the store price and DROPKE will match the wallet credit.', kind: 'custom' },
];

export function isPlatform(value: unknown): value is Platform {
  return allPlatforms.includes(String(value) as Platform);
}

export function isRegionCode(value: unknown): value is RegionCode {
  return allRegionCodes.includes(String(value) as RegionCode);
}

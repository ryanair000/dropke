import type { Platform, RegionCode } from '@/types/dropke';

export const allPlatforms: Platform[] = ['PlayStation', 'Xbox', 'Nintendo', 'PC'];
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

export function isPlatform(value: unknown): value is Platform {
  return allPlatforms.includes(String(value) as Platform);
}

export function isRegionCode(value: unknown): value is RegionCode {
  return allRegionCodes.includes(String(value) as RegionCode);
}

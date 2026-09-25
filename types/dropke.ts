export type Platform = 'PlayStation' | 'Xbox' | 'Nintendo' | 'PC';
export type RegionCode = 'US' | 'UK' | 'ZA' | 'AE' | 'IN' | 'BR';
export type InventoryStatus = 'available' | 'reserved' | 'sold';
export type OrderStatus = 'awaiting_payment' | 'paid_pending_fulfilment' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'success' | 'failed';
export type ProductKind = 'vbucks' | 'crew' | 'pack' | 'custom';

export type ProductDefinition = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  kind: ProductKind;
  vbucksAmount?: number;
};

export type PlatformRegion = {
  platform: Platform;
  region: RegionCode;
  regionName: string;
  storeCurrency: string;
  walletCurrency: string;
};

export type PublicCatalog = {
  products: ProductDefinition[];
  setups: PlatformRegion[];
};

export type QuoteSku = {
  skuId: string;
  sku: string;
  denomination: number;
  sellPriceKes: number;
};

export type Quote = {
  quoteId?: string;
  expiresAt?: string;
  productId: string;
  productName: string;
  platform: Platform;
  region: RegionCode;
  regionName: string;
  currency: string;
  currencySymbol: string;
  walletCurrency: string;
  storePrice: number;
  matchedCredit: number;
  balanceRemaining: number;
  kesPrice: number;
  creditLabel: string;
  cardBreakdown: string[];
  skuSelections: QuoteSku[];
  soldOut: boolean;
};

export type PublicOrder = {
  ref: string;
  productName: string;
  platform: Platform;
  regionName: string;
  currency: string;
  storePrice: number;
  matchedCredit: number;
  balanceRemaining: number;
  kesPrice: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  deliveredAt?: string;
  codes?: string[];
};

export type SafeCheckout = {
  productName: string;
  platform: Platform;
  regionName: string;
  storePrice: number;
  matchedCredit: number;
  balanceRemaining: number;
  kesPrice: number;
  creditLabel: string;
  cardBreakdown: string[];
  soldOut: boolean;
};

export type StockRow = {
  id: string;
  sku: string;
  platform: Platform;
  region_code: RegionCode;
  region_name: string;
  currency: string;
  denomination: number | string;
  sell_price_kes: number;
  low_stock_threshold: number;
  active: boolean;
  available_count: number;
  reserved_count: number;
  sold_count: number;
};

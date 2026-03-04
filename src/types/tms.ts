export interface TmsAddress {
  postalCode: string;
  city: string;
  state: string;    // two-letter province/state code
  country: string;  // two-letter country code
}

export interface TmsItem {
  name: string;
  sku: string;
  quantity: number;
  weightLbs: number;   // converted from grams by the route layer before calling adapter
  priceCents: number;
}

export interface TmsRateRequest {
  origin: TmsAddress;
  destination: TmsAddress;
  items: TmsItem[];
  currency: string;
  totalWeightLbs: number;  // pre-computed sum — adapter does not re-sum
}

export interface TmsRateOption {
  serviceName: string;
  serviceCode: string;
  totalCents: number;      // integer cents — route layer converts to string for Shopify
  description: string;
  currency: string;
  minDeliveryDate: Date;
  maxDeliveryDate: Date;
}

export interface TmsRateResponse {
  rates: TmsRateOption[];
}

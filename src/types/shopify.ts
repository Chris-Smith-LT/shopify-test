export interface ShopifyAddress {
  country: string;
  postal_code: string;
  province: string;
  city: string;
  name: string;
  address1: string;
  address2: string;
  address3: string;
  phone: string;
  fax: string;
  email: string;
  address_type: string;
  company_name: string;
}

export interface ShopifyItem {
  name: string;
  sku: string;
  quantity: number;
  grams: number;           // Shopify sends weight in grams under this key
  price: number;           // cents (e.g., 29900 = $299.00)
  vendor: string;
  requires_shipping: boolean;
  taxable: boolean;
  fulfillment_service: string;
  properties: Record<string, string> | null;
  product_id: number;
  variant_id: number;
}

// The shape Shopify POSTs to our endpoint — note the outer "rate" wrapper
export interface ShopifyRateRequestBody {
  rate: {
    origin: ShopifyAddress;
    destination: ShopifyAddress;
    items: ShopifyItem[];
    currency: string;
    locale: string;
  };
}

// A single rate option returned to Shopify
export interface ShopifyRateOption {
  service_name: string;
  service_code: string;
  total_price: string;       // cents as a STRING — e.g., "28500" for $285.00
  description: string;
  currency: string;
  min_delivery_date: string; // ISO 8601
  max_delivery_date: string; // ISO 8601
}

// The full response body returned to Shopify
export interface ShopifyRateResponse {
  rates: ShopifyRateOption[];
}

import 'dotenv/config';

const REQUIRED_VARS = [
  'APP_URL',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_SHOP_DOMAIN',
] as const;

function validate() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[Config] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[Config] Copy .env.example to .env and fill in all values');
    process.exit(1);
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    appUrl: process.env.APP_URL!,
    shopifyClientId: process.env.SHOPIFY_CLIENT_ID!,
    shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET!,
    shopifyScopes: process.env.SHOPIFY_SCOPES ?? 'write_shipping,read_orders',
    shopifyShopDomain: process.env.SHOPIFY_SHOP_DOMAIN!,
    shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN ?? '',
    ltlMinWeightGrams: parseInt(process.env.LTL_MIN_WEIGHT_GRAMS ?? '68039', 10),
    // TMS call timeout in ms — on timeout, returns { rates: [] } so checkout never breaks
    tmsTimeoutMs: parseInt(process.env.TMS_TIMEOUT_MS ?? '7000', 10),
    // Rate cache TTL in ms — cached per origin ZIP + destination ZIP + total weight
    cacheTtlMs: parseInt(process.env.CACHE_TTL_MS ?? String(20 * 60 * 1000), 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}

export const config = validate();

# AI Context — Shopify LTL Carrier Service

This file is a map of the project for any AI model. Read this first to orient quickly.

---

## What This Is

A **Node.js/TypeScript Express app** that acts as a custom shipping rate provider for Shopify. At checkout, Shopify sends cart data (origin, destination, item weights) to this app via HTTP POST. The app queries a freight TMS (Transportation Management System) for an LTL rate quote and returns it to Shopify, where it appears alongside standard carriers like UPS.

**LTL = Less Than Truckload** — freight shipping for heavy/large shipments (pallets, bulk goods) that exceed standard parcel limits (~150 lbs). The app returns `{ "rates": [] }` for carts that don't qualify, causing Shopify to fall back to UPS only.

**Phase 1 (complete):** Rate quoting via mock TMS adapter. End-to-end tested on a Shopify dev store.
**Phase 2 (not started):** Order/shipment creation in the TMS after purchase.

---

## Project Structure

```
/
├── src/
│   ├── app.ts                          # Express app factory — createApp(adapter?)
│   ├── server.ts                       # Entry point — binds port, SIGTERM handler, startup logs
│   ├── config.ts                       # Validates required env vars at startup, exports typed config
│   ├── logger.ts                       # Pino structured JSON logger (CloudWatch/Azure Monitor ready)
│   ├── types/
│   │   ├── shopify.ts                  # Shopify request/response TypeScript interfaces
│   │   └── tms.ts                      # Internal TMS request/response interfaces
│   ├── middleware/
│   │   └── verifyShopifyHmac.ts        # HMAC-SHA256 request verification
│   ├── services/
│   │   ├── TmsRateAdapter.ts           # Interface: getRates(request): Promise<TmsRateResponse>
│   │   ├── MockTmsAdapter.ts           # POC implementation — returns $285 hardcoded rate
│   │   └── RateCache.ts               # In-memory TTL cache keyed by origin ZIP + dest ZIP + grams
│   └── routes/
│       ├── health.ts                   # GET /health → { status: "ok" }
│       ├── auth.ts                     # GET /auth + GET /auth/callback (Shopify OAuth)
│       └── rates.ts                    # POST /api/shopify/rates (core rate endpoint)
├── scripts/
│   └── register-carrier.ts            # One-time setup: registers callback URL with Shopify
├── docs/
│   ├── POC_INTEGRATION.md             # POC build steps — all complete
│   ├── PROD_INTEGRATION.md            # Production hardening steps
│   ├── DEV_STORE_SETUP.md             # How to set up a Shopify dev store (current as of 2026)
│   ├── TESTING.md                     # Test cases and checklists
│   ├── INFRASTRUCTURE.md              # AWS App Runner / Azure App Service deployment
│   ├── MONITORING.md                  # Keep-alive, alerting, logging
│   ├── REQUIREMENTS.md                # Original client requirements
│   └── ISSUES_AND_QUESTIONS.md        # Open questions for the client
├── Dockerfile                         # Multi-stage build — builder stage compiles TS, prod stage runs dist/
├── .dockerignore
├── .env.example                       # Template for all environment variables
├── README.md                          # Setup and running locally
├── SHOPIFY_INTEGRATION_PLAN.md        # High-level project overview and doc index
├── package.json
└── tsconfig.json
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ "status": "ok" }` — used by cloud host and keep-alive pings |
| `GET` | `/auth` | Starts Shopify OAuth flow — requires `?shop=` query param |
| `GET` | `/auth/callback` | OAuth callback — exchanges code for access token, writes to `.env` |
| `POST` | `/api/shopify/rates` | Core endpoint — Shopify calls this at checkout to get LTL rates |

---

## Critical: Shopify Payload Format

Shopify wraps the rate request in a `rate` key and uses `grams` (not `weight`) for item weight:

```json
{
  "rate": {
    "origin": { "postal_code": "44114", "city": "Cleveland", "province": "OH", "country": "US" },
    "destination": { "postal_code": "90210", "city": "Beverly Hills", "province": "CA", "country": "US" },
    "items": [{ "name": "Dog Food Pallet", "sku": "DF-001", "quantity": 2, "grams": 68039 }],
    "currency": "USD",
    "locale": "en"
  }
}
```

Response must have `total_price` as **cents in a string** (e.g., `"28500"` = $285.00):

```json
{
  "rates": [
    {
      "service_name": "LTL Standard Freight",
      "service_code": "ltl-standard",
      "total_price": "28500",
      "currency": "USD",
      "min_delivery_date": "2026-03-06T00:00:00Z",
      "max_delivery_date": "2026-03-10T00:00:00Z"
    }
  ]
}
```

Return `{ "rates": [] }` with HTTP 200 for ineligible carts — Shopify falls back to UPS only.

---

## Key Design Decisions

**HMAC verification (`src/middleware/verifyShopifyHmac.ts`):**
Shopify signs every rate request with `X-Shopify-Hmac-Sha256` using the app's client secret. The middleware reads the raw body as a `Buffer` and computes HMAC-SHA256 to verify. Returns 401 on mismatch.
`express.raw({ type: 'application/json' })` is applied at the route level (not globally) so the raw Buffer is preserved before JSON parsing. Auth routes use normal query params and are unaffected.

**Adapter pattern (`src/services/`):**
`createRatesRouter(adapter: TmsRateAdapter)` accepts any adapter implementing the interface. `app.ts` passes `new MockTmsAdapter()`. Swapping to `RealTmsAdapter` for production is a one-line change in `app.ts`.

**LTL eligibility:**
Total grams across all items (`item.grams * item.quantity`) must meet the threshold. Default: 150 lbs = 68,039 grams. Configurable via `LTL_MIN_WEIGHT_GRAMS` env var.

**OAuth token persistence:**
The `/auth/callback` handler writes `SHOPIFY_ACCESS_TOKEN` directly into the `.env` file after the OAuth exchange. The in-memory nonce Map is sufficient for a single-process deployment.

---

## Environment Variables (`.env`)

```
PORT=3000
APP_URL=""                    # Public HTTPS URL (ngrok locally, cloud URL in production)
SHOPIFY_CLIENT_ID=""          # From Dev Dashboard app
SHOPIFY_CLIENT_SECRET=""      # From Dev Dashboard app
SHOPIFY_SCOPES="write_shipping,read_orders"
SHOPIFY_SHOP_DOMAIN=""        # Bare domain only — e.g. my-store.myshopify.com (NO https://)
SHOPIFY_ACCESS_TOKEN=""       # Written automatically by OAuth flow
LTL_MIN_WEIGHT_GRAMS=""       # Optional — defaults to 68039 (150 lbs)
TMS_TIMEOUT_MS=""             # Optional — defaults to 7000 (7 seconds)
CACHE_TTL_MS=""               # Optional — defaults to 1200000 (20 minutes)
LOG_LEVEL=""                  # Optional — defaults to "info"
```

---

## npm Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start with ts-node (development) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled app from `dist/` |
| `npm run register` | Register carrier service callback URL with Shopify (one-time per environment) |

---

## Shopify Platform Notes (as of 2026)

- **Dev Dashboard:** Dev stores and apps live at `dev.shopify.com` — not `partners.shopify.com`
- **OAuth required:** Legacy store-admin tokens (`shpat_...`) deprecated Jan 1, 2026
- **GraphQL required:** REST Carrier Service API deprecated Oct 2024; `register-carrier.ts` uses `carrierServiceCreate` GraphQL mutation (API version `2025-01`)
- **Plan tier:** Merchant store must be on **Advanced plan or higher** for carrier-calculated shipping; dev stores should be created on the Advanced tier in Dev Dashboard
- **Store location:** Settings → Locations must have a fully populated address or Shopify sends null for all origin fields
- **Activation:** Registering the carrier service is not enough — it must also be enabled in a shipping zone (Settings → Shipping and delivery → Manage rates → Add rate → Use carrier or app)
- **Trigger:** The Carrier Service API fires at the checkout shipping step and on address change — not on cart additions

## ngrok (Local Development — Free Plan)

When the ngrok URL changes (every restart on free plan), update **three places**:
1. `APP_URL` in `.env`
2. Redirect URL in Dev Dashboard app config (app version → Redirect URLs)
3. Carrier service callback — delete LTL Freight from Settings → Shipping and delivery → Manage rates, then re-run `npm run register` (`carrierServiceCreate` cannot update in place)

---

## What's Left to Build

See `docs/PROD_INTEGRATION.md` for full detail. Summary:

| Step | Status |
|------|--------|
| HMAC verification | ✅ Built |
| Health check endpoint | ✅ Built |
| App scopes (`write_shipping`, `read_orders`) | ✅ Registered |
| Real TMS adapter (replace MockTmsAdapter) | Pending — needs TMS API docs/credentials |
| Rate caching (origin ZIP + dest ZIP + weight, 15–30 min TTL) | Pending |
| Timeout handling (7s TMS timeout → `{ "rates": [] }`) | Pending |
| Input validation (zero-weight, missing ZIPs) | Pending |
| Structured JSON logging | Pending |
| Secrets migration (`.env` → Secrets Manager / Key Vault) | Pending |
| Containerization (add `Dockerfile`) | Pending |
| Cloud deployment (AWS App Runner or Azure App Service) | Pending — see `docs/INFRASTRUCTURE.md` |

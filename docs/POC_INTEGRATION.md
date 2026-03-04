# POC Integration Plan

**Goal:** Prove the end-to-end flow works — Shopify calls our app at checkout, our app returns rates, and they appear alongside UPS. Uses mock rates in place of the real TMS. No production hardening required.

**Prerequisites:**
- Shopify dev store created on **Advanced plan** via `dev.shopify.com` — see `DEV_STORE_SETUP.md`
- App created in Dev Dashboard with `write_shipping` and `read_orders` scopes, installed on dev store
- OAuth flow completed — `SHOPIFY_ACCESS_TOKEN` populated in `.env`
- Carrier service registered via `npm run register`
- Store location address fully populated in Settings → Locations
- ngrok installed and running, `APP_URL` set in `.env`

---

## How to Set Up for Testing

### What You Can Do Right Now (No Shopify Credentials Needed)

Build the full app and test the rate endpoint using **Postman or curl** to simulate what Shopify would send:

```bash
curl -X POST http://localhost:3000/api/shopify/rates \
  -H "Content-Type: application/json" \
  -d '{
    "rate": {
      "origin": { "postal_code": "44114", "city": "Cleveland", "province": "OH", "country": "US", "name": "", "address1": "", "address2": "", "address3": "", "phone": "", "fax": "", "email": "", "address_type": "", "company_name": "" },
      "destination": { "postal_code": "90210", "city": "Beverly Hills", "province": "CA", "country": "US", "name": "John Doe", "address1": "", "address2": "", "address3": "", "phone": "", "fax": "", "email": "", "address_type": "", "company_name": "" },
      "items": [{ "name": "Dog Food Pallet", "sku": "DF-001", "quantity": 2, "grams": 68039, "price": 29900, "vendor": "", "requires_shipping": true, "taxable": true, "fulfillment_service": "manual", "properties": null, "product_id": 1, "variant_id": 1 }],
      "currency": "USD",
      "locale": "en"
    }
  }'
```

> Note: Shopify wraps the payload in a `rate` key and uses `grams` (not `weight`) for item weight. This curl example matches the actual Shopify format.

> **HMAC note:** The app enforces HMAC verification on all rate requests. A raw curl without a valid `X-Shopify-Hmac-Sha256` header will return HTTP 401. This curl example is useful for validating payload parsing and response format in isolation — for full end-to-end testing including HMAC, use the Shopify checkout flow.

This validates all app logic before Shopify is involved.

### Install ngrok

Download from ngrok.com (free, no credit card needed):
```bash
ngrok http 3000
```
Provides a public HTTPS URL like `https://abc123.ngrok-free.app` tunneling to your local machine. Shopify requires HTTPS — ngrok provides that instantly.

> **Free plan:** The ngrok URL changes every time you restart it. Each time it changes, update **three places**: `APP_URL` in `.env`, the redirect URL in the Dev Dashboard app config, and the carrier service callback URL (delete LTL Freight from **Settings → Shipping and delivery → Manage rates**, then re-run `npm run register`). See `DEV_STORE_SETUP.md` Step 4 for details.

### Get the Dev Store Created

See [`docs/DEV_STORE_SETUP.md`](DEV_STORE_SETUP.md) for the full step-by-step guide covering the current Shopify Dev Dashboard workflow.

Key points:
- Dev stores and apps now live at `dev.shopify.com` — not the Partner Dashboard
- Create the dev store on the **Advanced plan tier** to avoid carrier-calculated shipping issues
- All new apps use **OAuth** — legacy store-admin tokens (`shpat_...`) are deprecated as of January 1, 2026
- The app is created in the Dev Dashboard with `write_shipping` and `read_orders` scopes
- OAuth flow is triggered by visiting `/auth?shop=<your-store>.myshopify.com` locally — the token is written to `.env` automatically

### Add Test Products to the Dev Store

Add products that represent real LTL scenarios:
- **Heavy product** (e.g., "Dog Food Pallet" — 150 lbs / 68,039 grams) — should trigger LTL rates
- **Light product** (e.g., "Dog Collar" — 0.5 lbs / 227 grams) — should return no LTL rates

Weight is the only field that matters — price is not required. Set weight in **lb** in the Shipping section of the product settings. This is what Shopify passes to our app in the rate request.

---

## Build Steps

### Step 1 — Project Scaffold

- Initialize Node.js/TypeScript project
- Install dependencies: `express`, `dotenv`, `axios`, `typescript`, `ts-node`, `tsx`
- Create `.env` file:
  ```
  PORT=3000
  APP_URL=""                          # ngrok HTTPS URL
  SHOPIFY_CLIENT_ID=""                # from Dev Dashboard app
  SHOPIFY_CLIENT_SECRET=""            # from Dev Dashboard app
  SHOPIFY_SCOPES="write_shipping,read_orders"
  SHOPIFY_SHOP_DOMAIN=""              # bare domain only, no https://
  SHOPIFY_ACCESS_TOKEN=""             # populated after OAuth flow
  ```
- Directory structure:
  ```
  /src
    /routes       # rate callback, auth, health endpoints
    /services     # TMS adapter interface + mock implementation
    /types        # TypeScript interfaces for Shopify and TMS
    /middleware   # HMAC verification
  /scripts        # carrier service registration script
  ```

### Step 2 — Rate Callback Endpoint

Build `POST /api/shopify/rates` that:
1. Parses the incoming Shopify payload (origin, destination, items)
2. Converts item weights from grams → lbs
3. Calls the mock TMS adapter
4. Returns hardcoded rates in Shopify format

**Incoming Shopify payload** (note the `rate` wrapper and `grams` field):
```json
{
  "rate": {
    "origin": { "postal_code": "...", "city": "...", "province": "...", "country": "US" },
    "destination": { "postal_code": "...", "city": "...", "province": "...", "country": "US" },
    "items": [{ "name": "...", "sku": "...", "quantity": 1, "grams": 10000, "price": 9999 }],
    "currency": "USD",
    "locale": "en"
  }
}
```

**Response to Shopify** (note `total_price` is cents as a string):
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

Return `{ "rates": [] }` with HTTP 200 if the cart doesn't qualify for LTL — Shopify falls back to UPS only.

### Step 3 — Mock TMS Adapter

- Define a `TmsRateAdapter` TypeScript interface with a single `getRates(request)` method
- Implement `MockTmsAdapter` that returns realistic hardcoded rates instantly
- The rate callback calls the adapter through the interface — swapping in the real adapter later requires no changes to the route handler

### Step 4 — Carrier Service Registration Script

A one-time script (`scripts/register-carrier.ts`) that calls the Shopify Admin API to register our callback URL:

```graphql
mutation CreateCarrierService($input: DeliveryCarrierServiceCreateInput!) {
  carrierServiceCreate(input: $input) {
    carrierService { id name callbackUrl active }
    userErrors { field message }
  }
}
```

Variables:
```json
{
  "input": {
    "name": "LTL Freight",
    "callbackUrl": "https://<ngrok-url>/api/shopify/rates",
    "supportsServiceDiscovery": true,
    "active": true
  }
}
```

### Step 5 — Connect and Test with ngrok

1. Start the Express app locally (`npm run dev`)
2. Run `ngrok http 3000` — copy the public HTTPS URL into `APP_URL` in `.env`
3. Update the redirect URL in the Dev Dashboard app config to match the new ngrok URL
4. Run `npm run register` to register the carrier service callback URL with Shopify
5. In the Shopify dev store admin, use **"Test your app"** (`supportsServiceDiscovery`) to send a test rate request without a real checkout
6. Add an LTL-qualifying product to the dev store, proceed to checkout, confirm LTL rates appear alongside UPS

---

## POC Success Criteria

- [x] Shopify dev store checkout shows LTL rates returned by our app
- [x] LTL rates appear alongside (not replacing) existing UPS rates
- [x] Returning `{ "rates": [] }` correctly causes Shopify to show UPS rates only
- [x] App responds well within the 10-second Shopify timeout

---

## POC Testing

1. **Service discovery test:** Use Shopify's "Test your app" feature in the dev store admin to send a test rate request without a real checkout — confirms the endpoint is reachable and responding.
2. **Checkout test:** Add an LTL-qualifying product to the dev store, proceed to checkout, confirm mock LTL rates appear alongside UPS rates.
3. **Fallback test:** Return `{ "rates": [] }` intentionally and confirm Shopify displays UPS rates only with no errors.
4. **Response time check:** Confirm the app responds well within the 10-second Shopify timeout under normal conditions.

---

## What This POC Does Not Include

The following items were intentionally excluded from the POC. All of them must be addressed before production. See `PROD_INTEGRATION.md` for implementation steps.

| Gap | Risk if not addressed | Where to implement |
|-----|-----------------------|--------------------|
| **Real TMS adapter** — `MockTmsAdapter` returns a hardcoded $285 rate | App returns fictional rates in production | `src/services/RealTmsAdapter.ts` — swap in `app.ts` (one line) |
| **TMS timeout handling** — no timeout on TMS API calls | Slow/unresponsive TMS hangs checkout until Shopify's 10-second limit kills it, breaking the checkout experience | Wrap TMS call in a 7-second `Promise.race` → return `{ "rates": [] }` on timeout |
| **Rate caching** — every checkout hits the TMS directly | Unnecessary TMS load; repeated rate requests for the same cart are slow | In-memory cache keyed by origin ZIP + destination ZIP + total weight; 15–30 min TTL |
| **Input validation** — zero-weight items and missing ZIP codes pass through to the TMS | Bad data sent to TMS may cause errors or unexpected responses | Validate before TMS call; return `{ "rates": [] }` for invalid payloads |
| **Structured logging** — currently uses `console.log` | Logs are unqueryable in CloudWatch/Azure Monitor; debugging production issues is difficult | Replace with structured JSON logging (e.g., `pino`) |
| **Secrets management** — credentials stored in `.env` file | `.env` cannot be used on a cloud host; secrets would need to be in source control or passed unsafely | AWS Secrets Manager or Azure Key Vault; load at app startup |
| **Containerization** — no `Dockerfile` | App cannot be deployed to App Runner or App Service without one | Add `Dockerfile`; push image to ECR or ACR |
| **Cold start protection** — no keep-alive ping | App Runner/App Service can scale to zero; a cold start on a checkout could exceed Shopify's timeout | Scheduled `/health` ping every 5 minutes — see `MONITORING.md` |
| **Merchant store plan** — merchant must be on Shopify Advanced or higher | Carrier-calculated shipping is not available on lower plans | Confirm with merchant before go-live |

---

## POC Timeline

| Step | Status |
|------|--------|
| Build the app code | ✅ Complete |
| Install ngrok | ✅ Complete |
| Create dev store (Advanced plan) in Dev Dashboard | ✅ Complete |
| Create app with OAuth in Dev Dashboard | ✅ Complete |
| Run OAuth flow — token written to `.env` | ✅ Complete |
| Register carrier service via `npm run register` | ✅ Complete |
| Set store location address | ✅ Complete |
| Activate LTL Freight in shipping zone | ✅ Complete |
| Add test products | ✅ Complete |
| Checkout test — LTL rates appearing | ✅ Complete |

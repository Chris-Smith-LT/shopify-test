# Production Integration Plan

**Goal:** A hardened, reliable, cloud-hosted version of the app connected to the real TMS, with security, monitoring, caching, and a proper deployment pipeline.

**This plan is executed after:**
- POC validated end-to-end
- TMS API documentation, credentials, and sandbox environment received
- Cloud provider chosen (AWS or Azure) — see `INFRASTRUCTURE.md`
- TMS IP whitelisting requirements confirmed
- Freight class and LTL eligibility logic decisions made with client

---

## Build Steps

### Step 1 — Real TMS Adapter

Replace `MockTmsAdapter` with `RealTmsAdapter`:
- Implement the `TmsRateAdapter` interface against the actual TMS API
- Handle REST or SOAP depending on TMS type (`axios` for REST, `node-soap` for SOAP)
- Map Shopify fields → TMS request format (origin ZIP, destination ZIP, weight in lbs, freight class if required)
- Parse TMS response → Shopify rate format
- Handle TMS error responses and no-quote scenarios gracefully
- Test against TMS sandbox before pointing at production TMS

### Step 2 — Security: HMAC Request Verification ✅ Built in POC

HMAC middleware is already implemented in `src/middleware/verifyShopifyHmac.ts`:
- Shopify signs each request with `X-Shopify-Hmac-Sha256` using the app's client secret
- Middleware reads the raw request body as a `Buffer`, computes HMAC-SHA256 against `SHOPIFY_CLIENT_SECRET`
- Uses `crypto.timingSafeEqual` to compare — rejects with HTTP 401 if it doesn't match
- Applied at the route level (not globally) to preserve the raw Buffer before JSON parsing
- Prevents unauthorized third parties from calling our endpoint and abusing the TMS API

### Step 3 — Rate Caching & Timeout Handling

**Caching:**
- Cache TMS responses keyed by hash of `origin ZIP + destination ZIP + total weight`
- TTL: 15–30 minutes
- Start with in-memory cache (sufficient for single-instance deployment)
- Upgrade to Redis if multiple instances or persistence across restarts is needed

**Timeout handling:**
- Wrap every TMS API call in a 7-second timeout
- On timeout: log the event, return `{ "rates": [] }` with HTTP 200
- Shopify falls back to UPS — checkout never breaks

> **Note:** The Carrier Service API fires only at checkout (shipping step) and when a customer changes their address. It does not fire on cart additions.

### Step 4 — Input Validation

Before calling the TMS, validate the incoming Shopify payload:
- Reject requests with missing origin or destination ZIP codes
- Check for items with `grams: 0` or `null` — return `{ "rates": [] }` rather than passing bad data to TMS
- Apply LTL eligibility logic (weight threshold, product tag, or metafield — per client decision)
- Log all validation failures for debugging

### Step 5 — Health Check Endpoint & Logging ✅ Health check built in POC

The `GET /health` endpoint is already implemented and returns `{ "status": "ok" }`.

For production, add structured logging (JSON format) for all rate requests, TMS calls, cache hits/misses, timeouts, and errors. Log entries should include: timestamp, origin ZIP, destination ZIP, total weight, TMS response time, outcome.

### Step 6 — Shopify App Scopes ✅ Done

Both scopes were registered from the start during POC setup to avoid requiring a reinstall later:
- `write_shipping` — carrier service registration (Phase 1)
- `read_orders` — read order data for shipment creation (Phase 2)

### Step 7 — Secrets Migration

The POC reads credentials from a `.env` file. Cloud hosts do not use `.env` files — secrets must be stored in the cloud provider's secrets service and loaded at app startup.

- Move `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ACCESS_TOKEN`, and TMS credentials to **AWS Secrets Manager** or **Azure Key Vault**
- Update `src/server.ts` (or a dedicated `src/config.ts`) to fetch secrets at startup via the AWS or Azure SDK before the Express app begins accepting requests
- Non-sensitive config (`PORT`, `SHOPIFY_SHOP_DOMAIN`, `LTL_MIN_WEIGHT_GRAMS`) can remain as environment variables set in the cloud host's configuration panel

### Step 8 — Containerization

The app must be containerized before it can be deployed to App Runner or App Service.

- Add a `Dockerfile` to the project root:
  - Use a Node.js base image (e.g., `node:18-alpine`)
  - Copy source, install production dependencies only (`npm ci --omit=dev`)
  - Run the compiled app (`npm run build` → `npm start`)
- Add a `.dockerignore` excluding `node_modules/`, `dist/`, and `.env`
- Build and test the image locally before pushing to ECR or ACR

### Step 9 — Cloud Deployment

See `INFRASTRUCTURE.md` for full AWS and Azure deployment steps, cost estimates, and the decision checklist.

**URL transition from ngrok to production:** When switching from local ngrok to the cloud URL, update all three places:
1. `APP_URL` in the cloud host's environment config (replaces `.env`)
2. The redirect URL in the Dev Dashboard app config (for OAuth)
3. Re-run `npm run register` pointing at the production URL to update the carrier service callback in Shopify (`carrierServiceCreate` cannot update in place — delete the existing carrier service from **Settings → Shipping and delivery → Manage rates** first if one is already registered)

### Step 10 — Environments

Maintain two fully separate deployments:

| | Development | Production |
|-|-------------|-----------|
| Shopify store | Dev store (Dev Dashboard) | the merchant |
| TMS endpoint | TMS sandbox | TMS production |
| Hosting | Local + ngrok or low-cost cloud | AWS App Runner / Azure App Service |
| Secrets | `.env` file | AWS Secrets Manager / Azure Key Vault |
| Carrier service callback | ngrok URL or dev cloud URL | Production cloud URL |

### Step 11 — Go-Live Checklist

- [ ] Real TMS adapter tested against TMS sandbox end-to-end
- [ ] HMAC verification confirmed blocking unauthorized requests
- [ ] Rate caching tested — cache hits return correct rates instantly
- [ ] Timeout handling tested — TMS slowness returns `{ "rates": [] }` gracefully
- [ ] Input validation tested — zero-weight items handled correctly
- [ ] `/health` endpoint responding and keep-alive ping configured
- [ ] CloudWatch / Azure Monitor alerts active
- [ ] the merchant store on Shopify Advanced plan (or higher)
- [ ] App installed on the merchant with correct scopes (`write_shipping`, `read_orders`)
- [ ] Carrier service registered with production callback URL
- [ ] LTL rates confirmed appearing at checkout alongside UPS on live store
- [ ] LTL rates confirmed appearing in the merchant's cart page **"Estimate Shipping"** widget — the merchant's theme includes this feature and it must be verified separately from the checkout flow
- [ ] the merchant team notified and signed off

---

## Production Testing

5. **TMS sandbox test:** Connect `RealTmsAdapter` to TMS sandbox, run rate requests, verify correct rates are returned and mapped to Shopify format.
6. **HMAC verification test:** Send a request with an invalid or missing `X-Shopify-Hmac-Sha256` header — confirm app returns HTTP 401 and logs the rejection.
7. **Cache test:** Make the same rate request twice — confirm the second call returns instantly from cache and does not hit the TMS.
8. **Timeout test:** Simulate a slow TMS response (>7 seconds) — confirm app returns `{ "rates": [] }` gracefully and logs the timeout.
9. **Zero-weight validation test:** Send a rate request with `weight: 0` on all items — confirm app returns `{ "rates": [] }` without calling the TMS.
10. **Cold start test:** Let the app sit idle, then trigger a checkout — confirm response time stays within Shopify's timeout (validates keep-alive ping is working).
11. **Production go-live test:** With app installed on the merchant and production TMS connected, complete a full checkout as a real customer and confirm LTL rates appear correctly.

---

## What's NOT in Phase 1 (Production)

- Order/shipment creation in TMS (Phase 2)
- Multi-merchant / App Store distribution
- Admin UI for managing settings

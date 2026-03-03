# POC Integration Plan

**Goal:** Prove the end-to-end flow works — Shopify calls our app at checkout, our app returns rates, and they appear alongside UPS. Uses mock rates in place of the real TMS. No production hardening required.

**Prerequisites:**
- Shopify dev store created and accessible
- Custom app installed on dev store with `write_shipping` scope and access token in hand
- ngrok installed locally for HTTPS tunneling

---

## How to Set Up for Testing

### What You Can Do Right Now (No Shopify Credentials Needed)

Build the full app and test the rate endpoint using **Postman or curl** to simulate what Shopify would send:

```bash
curl -X POST http://localhost:3000/api/shopify/rates \
  -H "Content-Type: application/json" \
  -d '{
    "origin": { "postal_code": "44114", "city": "Cleveland", "province": "OH", "country": "US" },
    "destination": { "postal_code": "90210", "city": "Beverly Hills", "province": "CA", "country": "US" },
    "items": [{ "name": "Dog Food Pallet", "sku": "DF-001", "quantity": 2, "weight": 68039, "price": 29900 }],
    "currency": "USD"
  }'
```

This validates all app logic before Shopify is involved.

### Install ngrok

Download from ngrok.com (free, no credit card needed):
```bash
ngrok http 3000
```
Provides a public HTTPS URL like `https://abc123.ngrok-free.app` tunneling to your local machine. Shopify requires HTTPS — ngrok provides that instantly.

### Get the Dev Store Created

Ask the company Partner account admin:
> "Can you create a development store in our Shopify Partner account and add me as staff with full admin access?"

Once done, create the custom app from the store admin:
1. Store admin → **Settings → Apps and sales channels → Develop apps**
2. Click **Allow custom app development** if prompted
3. Click **Create an app** → name it `LTL Carrier Service`
4. Click **Configure Admin API scopes** → enable `write_shipping` and `read_orders` → Save
5. Click **Install app** → copy the **Admin API access token** (only shown once — save it immediately)

### Add Test Products to the Dev Store

Add products that represent real LTL scenarios:
- **Heavy product** (e.g., "Dog Food Pallet" — 150 lbs / 68,039 grams) — should trigger LTL rates
- **Light product** (e.g., "Dog Collar" — 0.5 lbs / 227 grams) — should return no LTL rates

Weight must be entered in the Shopify product settings — this is what Shopify passes to our app.

---

## Build Steps

### Step 1 — Project Scaffold

- Initialize Node.js/TypeScript project
- Install dependencies: `express`, `dotenv`, `axios`, `typescript`, `ts-node`
- Create `.env` file:
  ```
  SHOPIFY_ACCESS_TOKEN=shpat_...
  SHOPIFY_SHOP_DOMAIN=your-dev-store.myshopify.com
  PORT=3000
  ```
- Directory structure:
  ```
  /src
    /routes       # rate callback endpoint
    /services     # mock TMS adapter
    /types        # TypeScript interfaces for Shopify request/response
  /scripts        # carrier service registration script
  ```

### Step 2 — Rate Callback Endpoint

Build `POST /api/shopify/rates` that:
1. Parses the incoming Shopify payload (origin, destination, items)
2. Converts item weights from grams → lbs
3. Calls the mock TMS adapter
4. Returns hardcoded rates in Shopify format

**Incoming Shopify payload:**
```json
{
  "origin": { "postal_code": "...", "city": "...", "province": "...", "country": "US" },
  "destination": { "postal_code": "...", "city": "...", "province": "...", "country": "US" },
  "items": [{ "name": "...", "sku": "...", "quantity": 1, "weight": 10000, "price": 9999 }],
  "currency": "USD"
}
```

**Response to Shopify:**
```json
{
  "rates": [
    {
      "service_name": "LTL Standard Freight",
      "service_code": "ltl-standard",
      "total_price": "285.00",
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
2. Run `ngrok http 3000` — copy the public HTTPS URL
3. Run the registration script with the ngrok URL as the callback
4. In the Shopify dev store admin, use **"Test your app"** (`supportsServiceDiscovery`) to send a test rate request without a real checkout
5. Add an LTL-qualifying product to the dev store, proceed to checkout, confirm LTL rates appear alongside UPS

---

## POC Success Criteria

- [ ] Shopify dev store checkout shows LTL rates returned by our app
- [ ] LTL rates appear alongside (not replacing) existing UPS rates
- [ ] Returning `{ "rates": [] }` correctly causes Shopify to show UPS rates only
- [ ] App responds well within the 10-second Shopify timeout

---

## POC Testing

1. **Service discovery test:** Use Shopify's "Test your app" feature in the dev store admin to send a test rate request without a real checkout — confirms the endpoint is reachable and responding.
2. **Checkout test:** Add an LTL-qualifying product to the dev store, proceed to checkout, confirm mock LTL rates appear alongside UPS rates.
3. **Fallback test:** Return `{ "rates": [] }` intentionally and confirm Shopify displays UPS rates only with no errors.
4. **Response time check:** Confirm the app responds well within the 10-second Shopify timeout under normal conditions.

---

## POC Timeline

| Step | Blocker | Can Start? |
|------|---------|-----------|
| Build the app code | None | **Yes — now** |
| Test endpoint with Postman/curl | None | **Yes — now** |
| Install ngrok | None | **Yes — now** |
| Get dev store created | Needs company Partner admin | Waiting |
| Create custom app + get access token | Needs dev store | After admin creates store |
| Register carrier service + test checkout | Needs access token + ngrok running | After above |

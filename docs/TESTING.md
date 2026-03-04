# Testing Plan

---

## Environments

Two fully separate environments must exist before production testing begins. Never test against the live merchant store or production TMS.

| | Development / POC | Production |
|-|-------------------|-----------|
| Shopify store | Dev store (Shopify Dev Dashboard) | The merchant's live store |
| TMS endpoint | TMS sandbox | TMS production |
| Hosting | Local + ngrok | AWS App Runner / Azure App Service |
| Secrets | `.env` file | AWS Secrets Manager / Azure Key Vault |
| Carrier service callback | ngrok URL or dev cloud URL | Production cloud URL |

---

## Phase 1 — POC Testing

Goal: confirm the end-to-end flow works with mock rates before any real TMS is involved.

### Local Endpoint Testing *(no Shopify credentials needed)*

Before connecting Shopify at all, validate app logic directly with curl or Postman:

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

> **Note:** The app enforces HMAC verification on all rate requests. A raw curl without a valid `X-Shopify-Hmac-Sha256` header will return HTTP 401. This curl is useful for validating payload parsing and response format in isolation — for full end-to-end testing including HMAC, use the Shopify checkout flow.

### Test Products for the Dev Store

Add these products to the Shopify dev store to cover both LTL and non-LTL scenarios:

| Product | Weight | Expected Behavior |
|---------|--------|-------------------|
| Dog Food Pallet | 150 lbs / 68,039 grams | Should trigger LTL rates |
| Dog Collar | 0.5 lbs / 227 grams | Should return `{ "rates": [] }`, UPS only |

### POC Test Cases

1. **Service discovery test** — Use Shopify's "Test your app" feature in the dev store admin (`supportsServiceDiscovery`) to send a test rate request without a real checkout. Confirms the endpoint is reachable and responding correctly.

2. **Checkout test** — Add an LTL-qualifying product to the dev store, proceed to checkout, confirm mock LTL rates appear alongside UPS rates.

3. **Fallback test** — Return `{ "rates": [] }` intentionally and confirm Shopify displays UPS rates only, with no error shown to the customer.

4. **Response time check** — Confirm the app responds well within the 10-second Shopify timeout under normal conditions.

### POC Success Criteria

- [x] Shopify dev store checkout shows LTL rates returned by our app
- [x] LTL rates appear alongside (not replacing) existing UPS rates
- [x] Returning `{ "rates": [] }` correctly causes Shopify to show UPS rates only
- [x] App responds well within the 10-second Shopify timeout

---

## Phase 2 — Production Testing

Run these tests after the real TMS adapter is built and pointed at the TMS sandbox. Do not run against production TMS until all sandbox tests pass.

### 5. TMS Sandbox Test
Connect `RealTmsAdapter` to the TMS sandbox. Send rate requests covering a range of weights and ZIP code combinations. Verify:
- Rates are returned and correctly mapped to Shopify format
- Service name and price fields are populated
- No-quote responses from the TMS are handled gracefully (returns `{ "rates": [] }`, not an error)

### 6. HMAC Verification Test
Send a request with an invalid or missing `X-Shopify-Hmac-Sha256` header. Confirm:
- App returns HTTP 401
- Request is logged as rejected
- No TMS call is made

### 7. Cache Test
Make the same rate request (same origin ZIP, destination ZIP, total weight) twice in succession. Confirm:
- Second response returns instantly
- TMS is only called once (cache hit logged, no outbound TMS request on second call)

### 8. Timeout Test
Simulate a slow TMS response exceeding 7 seconds. Confirm:
- App returns `{ "rates": [] }` with HTTP 200
- Timeout is logged with context (origin ZIP, destination ZIP, weight)
- Shopify falls back to UPS — checkout does not break or error

### 9. Zero-Weight Validation Test
Send a rate request with `weight: 0` on all items. Confirm:
- App returns `{ "rates": [] }` without calling the TMS
- Validation failure is logged

### 10. Cold Start Test
Let the app sit idle for 10+ minutes, then trigger a checkout. Confirm:
- Response time stays within Shopify's 3–10 second timeout
- This validates that the keep-alive ping is active and working — see `MONITORING.md`

### 11. Production Go-Live Test
With the app installed on the merchant's live store and connected to the production TMS:
- Complete a full checkout as a real customer using an LTL-qualifying product
- Confirm LTL rates appear correctly alongside UPS
- Confirm rate amount and service name are accurate

### Production Go-Live Checklist

- [ ] Real TMS adapter tested against TMS sandbox end-to-end
- [ ] HMAC verification confirmed blocking unauthorized requests
- [ ] Rate caching tested — cache hits return correct rates instantly
- [ ] Timeout handling tested — TMS slowness returns `{ "rates": [] }` gracefully
- [ ] Input validation tested — zero-weight items handled correctly
- [ ] Cold start test passed — keep-alive ping confirmed working
- [ ] App installed on the merchant with correct scopes (`write_shipping`, `read_orders`)
- [ ] Carrier service registered with production callback URL
- [ ] LTL rates confirmed appearing at checkout alongside UPS on live store
- [ ] The merchant team notified and signed off

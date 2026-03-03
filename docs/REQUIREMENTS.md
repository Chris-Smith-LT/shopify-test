# Requirements — What We Have & What We Need

## What We Know

| Item | Detail |
|------|--------|
| End merchant | the merchant (single store) |
| Our client | Shipping company with an LTL TMS |
| App type | Custom App (not public — no App Store submission needed) |
| Tech stack | Node.js / TypeScript |
| Hosting | AWS or Azure (TBD — see `INFRASTRUCTURE.md`) |
| OAuth scopes | `write_shipping` (Phase 1), `read_orders` (Phase 2 — register upfront) |
| Shopify API | `carrierServiceCreate` GraphQL mutation to register; REST POST callback for rate requests |
| Rate timeout | Endpoint must respond within 3–10 seconds |
| Shopify Partner account | Confirmed — company account at partners.shopify.com |
| Repo | shopify-test |

---

## Outstanding Blockers

These must be resolved before production build begins. The POC can proceed without most of them.

1. **TMS API details:** Need the shipping company's TMS API endpoint, authentication method, and request/response format for rate quotes.
2. **Shopify API categories:** Waiting on original vendor to confirm which Shopify API areas need to be built under Shipping & Fulfillment.
3. **the merchant Shopify plan:** Store must be on **Shopify Advanced** (or higher) to use custom carrier-calculated shipping. Confirm current plan.
4. **Shopify dev store + custom app credentials:** Company Partner account admin needs to create a dev store and grant staff access; then create custom app via store admin → Settings → Develop apps → scope: `write_shipping`.

---

## Data Requirements

### From Shopify / the merchant

**Automatically included in every carrier service rate request (no setup needed):**

| Field | Format | Notes |
|-------|--------|-------|
| Origin address | Street, city, state, ZIP, country | The store's warehouse/ship-from address set in Shopify |
| Destination address | Street, city, state, ZIP, country | Customer's shipping address entered at checkout |
| Item name | String | Product title |
| Item SKU | String | Can be used to look up freight class if needed |
| Item quantity | Integer | Number of units |
| Item weight | Grams (integer) | Our app converts to lbs before sending to TMS |
| Item price | Cents (integer) | e.g., 9999 = $99.99 |
| Currency | String | e.g., "USD" |

**Must be configured in the merchant's Shopify store (their responsibility):**

| Requirement | Why It's Needed | Action Required |
|-------------|-----------------|-----------------|
| Accurate product weights | LTL rates are weight-based — missing or wrong weights = wrong rates | the merchant must enter weight on every product in Shopify admin |
| Warehouse/origin address | Shopify uses the store's ship-from address in the rate request | Confirm correct address is set in Shopify Settings → Shipping |
| Product dimensions *(if needed)* | Required for freight class calculation | If TMS needs dimensions, the merchant must add length/width/height — Shopify does **not** include dimensions in the carrier service payload by default |
| LTL eligibility flag *(TBD)* | How do we know which products are LTL vs. UPS? | Options: weight threshold (e.g., >150 lbs total), a product tag (e.g., `ltl`), or a Shopify metafield — **must be decided with client** |

> **Important:** Shopify's carrier service request does not include product dimensions. If the TMS requires dimensions for freight class, we must fetch them separately via the Shopify Admin API by SKU. This adds complexity and should be confirmed with the client before build.

---

### From the Shipping Company / TMS

**Access & credentials needed:**

| Item | Description |
|------|-------------|
| API endpoint URL | Base URL of the TMS rate quote API |
| Authentication method | API key, OAuth token, basic auth, or other |
| Credentials | The actual key/token for our app to authenticate |
| Sandbox/test environment | A non-production TMS endpoint for development and testing |

**Data the TMS needs to calculate a rate (confirm with client):**

| Field | Likely Required | Notes |
|-------|----------------|-------|
| Origin ZIP code | Yes | Extracted from Shopify rate request |
| Destination ZIP code | Yes | Extracted from Shopify rate request |
| Total shipment weight (lbs) | Yes | Sum of all items × quantity, converted from grams |
| Freight class | Likely | LTL pricing is class-based (Class 50–500); may be calculated internally or supplied by us |
| Number of pieces / pallets | Possibly | Some TMS systems require this |
| Product dimensions | Possibly | Needed to calculate density → freight class |
| Declared value | Possibly | For insurance/liability — derivable from item prices |
| Hazmat flag | Possibly | If any products are classified as hazardous |

**Data the TMS must return:**

| Field | Required by Shopify | Notes |
|-------|-------------------|-------|
| Rate amount (price) | Yes | Total freight cost in dollars |
| Service name | Yes | Displayed to customer at checkout (e.g., "LTL Standard Freight") |
| Transit time / delivery estimate | Recommended | Shopify can display min/max delivery dates |
| Carrier name | Optional | Can be included in service name |
| Error/no-quote response | Yes | TMS must clearly indicate when it cannot quote a shipment |

---

## Data Gaps to Resolve Before Production Build

1. **LTL eligibility:** How do we determine a cart qualifies for LTL vs. UPS? Weight threshold, product tag, or metafield?
2. **Freight class:** Does the TMS calculate freight class internally, or does our app need to supply it? If we supply it — where does it come from?
3. **Dimensions:** Does the TMS require product dimensions? If yes, the merchant must add them and we must fetch via Admin API.
4. **TMS no-quote handling:** If the TMS can't quote a shipment, do we fall back to UPS silently or show a message?

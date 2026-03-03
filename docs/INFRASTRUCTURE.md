# Infrastructure

## Architecture

```
┌──────────────────────────────────────────────┐
│  the merchant Shopify Checkout         │
│  (customer proceeds to checkout)             │
└───────────────────┬──────────────────────────┘
                    │ POST: weight, price, origin, destination
                    ▼
┌──────────────────────────────────────────────┐
│  Our LTL Carrier Service App (Node.js/TS)   │
│  Hosted on AWS or Azure                      │
│                                              │
│  POST /api/shopify/rates                     │
│  ├─ Parse & validate Shopify request         │
│  ├─ Map to TMS rate request format           │
│  ├─ Call Shipping Company TMS API  ─────────►│
│  │                                  ◄────────│ LTL rate quote
│  ├─ Map TMS response → Shopify format        │
│  └─ Return { rates: [...] } to Shopify       │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  Shipping Company TMS                        │
│  (calculates LTL freight rates)              │
│  API details: TBD                            │
└──────────────────────────────────────────────┘
```

---

## How Our App Interacts with Shopify

There are two distinct phases of interaction:

### Phase 1 — Registration (We Call Shopify, One Time)

We run a GraphQL mutation once during setup to tell Shopify our app exists and where to send rate requests:

```
Our App (registration script)
  → GraphQL: carrierServiceCreate mutation → Shopify Admin API
      → Shopify stores our public HTTPS callback URL
```

After this runs once, Shopify knows to call our app at every checkout. The URL only needs to be re-registered if it changes.

### Phase 2 — Live Checkout (Shopify Calls Us, Every Checkout)

Our app is passive — it just listens. Shopify initiates all contact:

```
Customer reaches shipping step at checkout
  → Shopify POSTs to our public HTTPS URL
  → Our app responds with rates
  → Shopify displays rates at checkout
```

**How authentication works:**

| Direction | Method |
|-----------|--------|
| Our app calling Shopify (registration) | Admin API access token (`shpat_...`) in request header |
| Shopify calling our app (checkout) | HMAC-SHA256 signature in `X-Shopify-Hmac-Sha256` header — our app verifies this |

---

## Services Involved

| # | Service | Owner | Role |
|---|---------|-------|------|
| 1 | **Shopify Platform** | Shopify | Hosts the merchant store; manages checkout; calls our app for rates |
| 2 | **the merchant Shopify Store** | the merchant | Where customers shop and check out; must have products with accurate weights |
| 3 | **Our Carrier Service App** | Us | The bridge — receives rate requests from Shopify, calls TMS, returns rates |
| 4 | **Shipping Company TMS** | Shipping company (our client) | Calculates LTL freight rates; returns quote to our app |
| 5 | **Cloud Host (AWS or Azure)** | Us / shipping company | Runs our app; provides the public HTTPS URL Shopify calls |
| 6 | **Rate Cache** | Our app (internal) | Stores recent TMS responses to speed up repeated rate requests |
| 7 | **Shopify Partner Dashboard** | Us | Used once during setup to register the app and carrier service |

### Interaction Summary

| From | To | Protocol | When | Required? |
|------|----|----------|------|-----------|
| Developer | Shopify Partner Dashboard | Browser (manual) | Setup only | Yes |
| Our App | Shopify Admin API | GraphQL / HTTPS | Setup only | Yes |
| Shopify Platform | Our App | REST POST / HTTPS | Every checkout | Yes |
| Our App | TMS | REST or SOAP / HTTPS | Every checkout (cache miss) | Yes |
| Our App | Shopify Admin API | GraphQL / HTTPS | Per rate request (if dimensions needed) | Maybe |
| Our App | Rate Cache | In-memory | Every checkout | Recommended |

### What Each Service Does NOT Do

| Service | Does NOT... |
|---------|-------------|
| Shopify | Call the TMS directly — it only knows about our app |
| Our App | Handle payment, orders, or fulfillment — rate quoting only (Phase 1) |
| TMS | Talk to Shopify directly — only our app interfaces with it |
| Rate Cache | Persist across app restarts (unless Redis is added) — acceptable for Phase 1 |
| Cloud Host | Store any customer data — our app is stateless except for the cache |

---

## Hosting Options

The app will be containerized with Docker. The shipping company will choose between AWS and Azure. **Public HTTPS is required** — Shopify mandates HTTPS for the carrier service callback URL. Both options handle this automatically.

### Decision Checklist

| Question | Answer → Use |
|----------|--------------|
| Does the company use Office 365 / Teams / Azure AD? | Yes → **Azure** |
| Does the company already have an AWS account? | Yes → **AWS** |
| No existing cloud preference? | → **AWS App Runner** (slightly simpler setup) |
| TMS requires IP whitelisting? | Confirm before choosing — both options add ~$35/month for a static IP |

---

### Option A: AWS App Runner *(recommended if not a Microsoft shop)*

**What it is:** A fully managed AWS service — provide a Docker container and AWS handles HTTPS, scaling, restarts, and uptime automatically. No servers to manage.

**Steps:**
1. Push Docker image to **AWS ECR** (Elastic Container Registry)
2. Create an **App Runner service** pointing to the ECR image
3. App Runner auto-provisions a public HTTPS URL
4. Store secrets in **AWS Secrets Manager** (`SHOPIFY_ACCESS_TOKEN`, TMS credentials, etc.)
5. Set up **CloudWatch alarms** for error rate and response time
6. Add a **CloudWatch scheduled event** to ping `/health` every 5 minutes (prevents cold starts)
7. If TMS requires IP whitelisting: add a **NAT Gateway** with an Elastic IP for static outbound traffic
8. Update carrier service callback URL in Shopify to the App Runner URL

**Cost estimate:** ~$5–15/month (+ ~$35/month if NAT Gateway is required for IP whitelisting)

**Maintenance:** Web console at console.aws.amazon.com — view logs, restart service, update environment variables

---

### Option B: Azure App Service *(recommended if already a Microsoft shop)*

**What it is:** Microsoft's managed app hosting platform — deploy a Docker container or Node.js app directly; Azure handles HTTPS, scaling, and uptime.

**Steps:**
1. Push Docker image to **Azure Container Registry (ACR)**
2. Create an **Azure App Service** (Linux, Docker container) pointing to ACR
3. App Service auto-provisions a public HTTPS URL (`*.azurewebsites.net`)
4. Store secrets in **Azure Key Vault**
5. Set up **Azure Monitor alerts** for error rate and response time
6. Add an **Azure Timer Function** to ping `/health` every 5 minutes (prevents cold starts)
7. If TMS requires IP whitelisting: configure **VNet integration + NAT Gateway** for a static outbound IP
8. Update carrier service callback URL in Shopify to the App Service URL

**Cost estimate:** ~$10–15/month (+ ~$35/month if VNet NAT is required for IP whitelisting)

**Maintenance:** Web console at portal.azure.com — familiar for Microsoft users; integrates with existing Azure AD accounts

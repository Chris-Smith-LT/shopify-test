# Shopify LTL Carrier Service Integration

## Overview

**Our client:** A shipping company that operates a TMS (Transportation Management System) for LTL freight quoting.
**End merchant:** The merchant — the shipping company's customer — whose Shopify store needs LTL freight rates at checkout.
**Problem:** When the merchant's customers add LTL-qualifying products to their cart and proceed to checkout, no LTL freight rates appear — only UPS rates load.
**Solution:** Build a Shopify Custom App that bridges Shopify and the shipping company's TMS — at checkout, Shopify sends cart data to our app, our app calls the TMS for a rate, and returns it to Shopify for display alongside UPS.

---

## Data Flow

```
the merchant checkout
  → Shopify sends product weight, price, origin, destination to our app
  → Our app calls Shipping Company TMS API
  → TMS returns LTL rate quote
  → Our app formats and returns rates to Shopify
  → Customer sees LTL freight rates at checkout alongside UPS
```

---

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1 — Rate Display** | Shopify pings our app at checkout; our app returns LTL rates from TMS | In planning |
| **Phase 2 — Shipment Creation** | When a customer places an order, create a shipment in the TMS | Future / out of scope |

---

## Documents

| File | Contents |
|------|----------|
| [`docs/POC_INTEGRATION.md`](docs/POC_INTEGRATION.md) | POC build steps, local testing setup with ngrok, success criteria |
| [`docs/PROD_INTEGRATION.md`](docs/PROD_INTEGRATION.md) | Production build steps, go-live checklist |
| [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) | Architecture diagram, services & interactions, AWS vs Azure hosting options |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | What we know, outstanding blockers, data requirements from Shopify and TMS |
| [`docs/ISSUES_AND_QUESTIONS.md`](docs/ISSUES_AND_QUESTIONS.md) | Potential risks, technical gaps, and clarifying questions for the client |
| [`docs/TESTING.md`](docs/TESTING.md) | POC and production test cases, test data, go-live checklist |
| [`docs/MONITORING.md`](docs/MONITORING.md) | Health check, structured logging, keep-alive ping, CloudWatch / Azure Monitor setup |

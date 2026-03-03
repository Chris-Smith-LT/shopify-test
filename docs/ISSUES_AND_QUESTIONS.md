# Potential Issues, Risks & Open Questions

---

## Potential Issues & Risks

### 1. Security — HMAC Request Verification *(must fix before production)*
Every rate request from Shopify includes an `X-Shopify-Hmac-Sha256` header that must be cryptographically verified. Without this, anyone on the internet could POST fake rate requests to our endpoint and abuse the TMS API. HMAC verification must be built into request middleware — not optional.

### 2. Cold Start Problem *(medium risk)*
AWS App Runner and Azure App Service can experience cold starts — if the app hasn't received traffic in a while, the container needs time to spin up. Shopify's 3–10 second timeout is tight. On a quiet store, the first checkout of the day could silently time out and show only UPS rates.

**Mitigation:** Scheduled keep-alive ping hitting `/health` every 5 minutes (CloudWatch event on AWS, Azure Timer Function on Azure) keeps the container warm.

### 3. IP Whitelisting Risk *(potentially a hard blocker)*
Some TMS systems only accept connections from whitelisted IP addresses. AWS App Runner and Azure App Service use dynamic IPs by default. If the TMS requires IP whitelisting, we need a static outbound IP (AWS NAT Gateway or Azure VNet integration) — this adds ~$35/month and setup complexity.

**Action:** Confirm with the shipping company immediately whether the TMS has IP restrictions. This must be known before choosing a hosting architecture.

### 4. Mixed Cart Handling *(business logic gap)*
If a customer's cart contains both LTL-eligible items (e.g., a 300 lb pallet) and small non-LTL items (e.g., accessories), it is unclear what should happen:
- Does the entire order go LTL?
- Do the small items get a separate UPS rate shown alongside?
- Are both options shown and the customer picks?

This is a business decision with direct technical implications. Must be decided with the client before building eligibility logic.

### 5. Product Data Quality Risk *(likely to cause bad rates)*
If the merchant hasn't entered weights on all their products, Shopify will send `weight: 0` in the rate request. Sending zero-weight data to the TMS will return bad or no quotes — silently.

**Mitigation:** Validate incoming weights before calling the TMS. If weight is missing or zero, return `{ "rates": [] }` rather than passing bad data downstream.

**Action:** the merchant must audit and complete product weights before go-live.

### 6. Freight Class — Biggest Technical Unknown *(must resolve before production build)*
LTL pricing is freight class-based (Class 50–500, determined by density, stowability, and commodity type). The answer changes how the app is built:

| Scenario | Complexity | Requires |
|----------|-----------|----------|
| TMS calculates class internally from weight/commodity | Low | Nothing extra |
| Our app calculates class from weight + dimensions | Medium | Dimensions fetched from Shopify metafields per request |
| Freight class stored as a Shopify metafield per product | Medium | the merchant must set up metafields for all products |

**Action:** Confirm with the shipping company how the TMS handles freight class before any production development starts.

### 7. TMS May Use SOAP/XML *(affects adapter complexity)*
Many TMS systems — especially older ones — use SOAP/XML rather than REST/JSON. SOAP requires a different Node.js library (`node-soap`), XML parsing, and different error handling patterns. If the TMS is SOAP-based, the adapter is significantly more work.

**Action:** Confirm TMS API type (REST or SOAP) and get sample request/response payloads before building the adapter.

### 8. No Monitoring or Alerting *(operational gap)*
If the app goes down or TMS calls start failing, LTL rates silently disappear from checkout with no notification. Production needs:
- A `/health` endpoint confirming the app is running
- Basic alerting on errors and timeouts (AWS CloudWatch or Azure Monitor)
- Structured logging for debugging production issues

### 9. No Environment Strategy *(testing risk)*
Without separate environments, testing could affect live checkouts. Minimum required:
- **Development:** local + ngrok, Shopify dev store, TMS sandbox
- **Production:** cloud-hosted, the merchant store, live TMS

### 10. the merchant Onboarding & Access *(process gap)*
The plan doesn't address how the app gets installed on the merchant's production Shopify store. Someone with admin access to their store must install the custom app. A point of contact at the merchant must be established before go-live.

### 11. Phase 2 Scope Creep Risk *(plan ahead now)*
Phase 2 (shipment creation) will require additional Shopify scopes (`read_orders`, `write_orders`) and webhook subscriptions. If not registered now, the merchant will need to re-install or re-authorize the app when Phase 2 begins.

**Recommendation:** Register `write_shipping` and `read_orders` during initial app setup even if `read_orders` isn't used yet.

---

## Clarifying Questions / Information Needed

### Shopify Store
1. What Shopify plan is the merchant currently on? *(Must be Advanced or higher — upgrade required if not already.)*
2. Can you provide access to the Shopify store for app installation, or should we coordinate through your Shopify admin?

### TMS API
3. What is the name of the TMS system? *(e.g., McLeod, TMW, custom-built, etc.)*
4. Does the TMS have a REST or SOAP API for rate quoting? Please provide API documentation.
5. What authentication does the TMS use? *(API key, OAuth, basic auth, etc.)*
6. What data does the TMS need to return a rate quote? *(origin ZIP, destination ZIP, weight, freight class, dimensions?)*
7. What does a sample TMS rate response look like?

### Business Logic
8. What is the weight threshold that classifies an order as LTL vs. parcel/UPS? *(e.g., over 150 lbs)*
9. Are there product-level flags in Shopify (SKU, tags, metafields) that identify LTL-eligible items?
10. How many rate options should appear at checkout? *(one "Standard LTL" rate, or multiple tiers?)*
11. Should transit time / delivery date estimates be shown at checkout?
12. Should any markup or handling fee be added on top of the raw TMS rate?
13. What should happen if the TMS is unavailable — silently fall back to UPS only, or show an error?

### Shipping Origin
14. What is the origin warehouse address? *(Street, city, state, ZIP — needed for accurate rate requests)*
15. Is there more than one origin location?

### TMS Technical Details
16. Does the TMS API restrict access by **IP address (whitelist)**? If yes, we need a static outbound IP configured before deployment.
17. Does the TMS have a **sandbox/test environment**? If not, how do we test without affecting production data?
18. Does the TMS **calculate freight class internally**, or does it require us to supply it? If we must supply it — where does the freight class data come from?
19. Is the TMS API **REST/JSON or SOAP/XML**? Please provide sample request and response payloads.
20. What is the **typical TMS API response time** for a rate quote? Is there an uptime SLA?

### the merchant
21. Has the merchant been informed about this integration? **Who is our point of contact** at their company for installation and go-live coordination?
22. Do all LTL-eligible products in their Shopify store already have **accurate weights** entered? If not, they must complete this before rates will work.
23. What should happen to LTL rates when a cart contains a **mix of LTL and non-LTL items**? (e.g., one heavy pallet + small accessories — does everything go LTL, or are rates shown separately?)
24. Are there any **product categories that should never show LTL rates**? (e.g., small accessories, hazmat items, digital products)

### Vendor / Technical Handoff
25. Which specific Shopify API categories did the original vendor identify? *(Expected under Shipping & Fulfillment)*
26. Are there any other existing systems (TMS webhooks, order management, etc.) we should be aware of?

### Business & Ongoing Maintenance
27. **Who maintains the app after launch** — our team, or someone at the shipping company? This determines how much documentation and how simple the deployment process needs to be.
28. What is the **expected checkout volume** on the merchant? *(Helps right-size hosting and determine how critical rate caching is)*

### Deployment & Code Ownership
29. **What is the engagement model — build-and-handoff or ongoing managed service?** This is the most important ownership question. If we build and hand off, the client owns the code and we document everything for their team. If we run it as a managed service, we retain operational control and they pay for ongoing hosting/maintenance.
30. **Who owns the source code and GitHub repository?** The repo should live in a GitHub organization under the client's company name (not our personal account). If the client doesn't have a GitHub account, one needs to be created under a company email before deployment. Confirm who controls that account.
31. **Does the shipping company have an existing AWS account?** If yes, we deploy into their account. If no, a new account should be created under a company email with billing in their name — not under our account. Confirm before any cloud setup begins.
32. **Who at the company will have access to the AWS console?** Someone on their side should have read access to CloudWatch logs and Secrets Manager (for rotating TMS credentials) even if we handle all code changes. Establish this contact before go-live.
33. **Who is responsible for rotating secrets if TMS credentials change?** TMS API keys and the Shopify access token will be stored in AWS Secrets Manager. If credentials rotate, someone needs to update them. Confirm whether that's us or someone at the shipping company.

### Phase 2 (Future)
34. Confirm: the TMS is the same system where shipments should be created in Phase 2?
35. What **additional data** will the TMS need to create a shipment beyond what's available at rate request time? *(e.g., contact name, phone number, special instructions)*

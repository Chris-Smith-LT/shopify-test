# Shopify Dev Store & App Setup Guide

This reflects the current Shopify developer platform as of early 2026. Shopify's Dev Dashboard (`dev.shopify.com`) became generally available on September 3, 2025 and is now the primary home for app development and dev stores. The Partner Dashboard (`partners.shopify.com`) is now focused on app distribution and client-transfer stores only.

---

## Overview

| What | Where |
|------|-------|
| Create dev stores | `dev.shopify.com` (Dev Dashboard) |
| Create and manage apps | `dev.shopify.com` (Dev Dashboard) |
| App Store distribution | `partners.shopify.com` (Partner Dashboard) |
| Client transfer stores | `partners.shopify.com` (Partner Dashboard) |

---

## Step 1 — Create a Development Store

1. Go to `dev.shopify.com` and sign in with your Shopify Partner credentials
2. Navigate to **Stores** → **Create store**
3. Select **Development store**
4. Choose a store name and set the plan tier to **Advanced**

> **Critical:** Select **Advanced** as the plan tier when creating the store. Dev stores on Advanced have carrier-calculated shipping (CCS) available without requiring support intervention. Dev stores created on Basic or Grow may show an "Upgrade Plan" prompt in the admin UI when trying to enable CCS, even though dev stores are technically exempt at the API level.

5. When prompted:
   - **Generate test data** → **Yes** — pre-populates the store with sample products, orders, and customers. Useful for checkout testing. You'll add your own LTL-specific products on top.
   - **Test feature preview** → **No** — not needed for this integration and may introduce unexpected behavior.
6. Complete store creation

---

## Step 2 — Create the App

1. In the Dev Dashboard, go to **Apps** → **Create app**
2. Name it (e.g., `LTL Carrier Service`)
3. Navigate to the app's **Configuration** settings
4. Under **API scopes**, add:
   - `write_shipping` — required for Phase 1 (carrier service registration)
   - `read_orders` — register now for Phase 2 to avoid re-installation later
5. Set the **App URL** — for a custom app, this can remain `https://example.com` (it's only used for public app install flows, not our OAuth-initiated flow)
6. Under **Redirect URLs**, add your ngrok callback URL:
   ```
   https://<your-ngrok-url>/auth/callback
   ```
   > This must be updated each time ngrok restarts on the free plan (the URL changes every session)
7. **Create a new version** with these settings and **release it**

---

## Step 3 — Install the App on the Dev Store

1. In the Dev Dashboard, navigate to your app
2. Find the option to install on a store and select your dev store
3. Complete the installation

---

## Step 4 — Set Up ngrok

Install ngrok and authenticate:
```bash
winget install ngrok.ngrok
ngrok config add-authtoken <your-token>
```

Your auth token is on the ngrok dashboard under **Your Authtoken**.

Start the tunnel:
```bash
ngrok http 3000
```

Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok-free.app`) into `.env`:
```
APP_URL="https://abc123.ngrok-free.app"
```

> **Free plan limitation:** The ngrok URL changes every time you restart it. When it changes, you must update `APP_URL` in `.env` AND update the redirect URL in the Dev Dashboard app configuration.

---

## Step 5 — Run the OAuth Flow

With the app running locally and ngrok active:

```bash
npm run dev
```

Visit in your browser:
```
http://localhost:3000/auth?shop=<your-dev-store>.myshopify.com
```

> **Important:** `SHOPIFY_SHOP_DOMAIN` in `.env` must be the bare domain only — no `https://` prefix. Use `lt-dev-test.myshopify.com`, not `https://lt-dev-test.myshopify.com`. Including the protocol breaks the OAuth URL construction.

Shopify will redirect to the consent screen. After approval, Shopify calls your `/auth/callback` route, which exchanges the code for a permanent offline access token and writes it automatically to `.env` as `SHOPIFY_ACCESS_TOKEN`.

---

## Step 6 — Register the Carrier Service

With `SHOPIFY_ACCESS_TOKEN` and `APP_URL` both set in `.env`:

```bash
npm run register
```

This runs the `carrierServiceCreate` GraphQL mutation to tell Shopify to call your app at checkout.

**If you see:** `Carrier Calculated Shipping must be enabled for your store`
- This means the CCS flag is not set on the store
- On a dev store created on the Advanced tier this should not happen
- If it does: contact Shopify support (`support@shopify.com`) and ask them to enable carrier-calculated shipping on your development store

---

## Step 7 — Set the Store Location Address

**This must be done before testing or Shopify will send null for all origin fields in the rate request**, which causes the carrier service to return no rates.

1. Go to the dev store admin → **Settings → Locations**
2. Click the default location
3. Fill in **all** address fields: street address, city, state, ZIP code, country
4. Save

This address becomes the origin in every carrier service rate request Shopify sends to your app.

---

## Step 8 — Activate the Carrier Service in the Store

Registration tells Shopify that the carrier service exists. You still need to activate it within a shipping zone:

1. Go to the dev store admin → **Settings → Shipping and delivery**
2. Under your shipping profile, click **Manage rates**
3. In a shipping zone, click **Add rate**
4. Select **Use carrier or app to calculate rates**
5. Your registered carrier service (`LTL Freight`) should appear — enable it
6. Save

> **Note:** After enabling, if you click to edit the `LTL Freight` rate you'll see percentage and flat amount fields. These are for adding an optional markup on top of the carrier-calculated rate (e.g., a handling fee). Leave them at 0 — the base rate comes from your app's response.

---

## Step 9 — Add Test Products

Add products to the dev store that cover both LTL and non-LTL scenarios:

| Product | Weight | Expected Behavior |
|---------|--------|-------------------|
| Dog Food Pallet | 150 lbs / 68,039 grams | Triggers LTL rates |
| Dog Collar | 0.5 lbs / 227 grams | Returns empty rates (UPS only at checkout) |

Weight must be entered in the Shopify product settings — this is what Shopify sends in the rate request. Price is not required for carrier service testing.

To add a product: store admin → **Products** → **Add product** → fill in name → scroll to **Shipping** section → check **This is a physical product** → set weight in **lb** → Save.

---

## Step 10 — Test

**Local endpoint test (no Shopify needed):**
```bash
curl -X POST http://localhost:3000/health
```
Should return `{ "status": "ok" }`.

**Checkout test:**
1. Go to the storefront via store admin → **Online Store** → **View your store**
2. Dev stores are password-protected by default — enter the password from **Online Store → Preferences → Password protection** when prompted (it cannot be disabled on dev stores)
3. Add the heavy product to the cart
4. Proceed to checkout and enter a US shipping address
5. LTL rates should appear at the shipping step alongside any default rates

See `TESTING.md` for the full test case list.

---

## Notes on the New Dev Dashboard

- **Dev stores are not visible in the Partner Dashboard** — they live exclusively in the Dev Dashboard at `dev.shopify.com`
- **Apps must use GraphQL** — the REST Carrier Service API was deprecated October 2024; new apps are required to use GraphQL as of April 2025. Our registration script already uses `carrierServiceCreate` (GraphQL).
- **Redirect URL must be registered in the app version** — each app version has its own redirect URL list. If you create a new version, re-add the redirect URL.
- **Organization-level access** — team members may need to be explicitly invited to individual dev stores in the Dev Dashboard, as org-wide visibility is no longer automatic.

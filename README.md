# Shopify LTL Carrier Service

A Node.js/TypeScript app that bridges Shopify checkout and an LTL freight TMS. At checkout, Shopify sends cart data to this app, which calls the TMS for a rate quote and returns it to Shopify for display alongside standard shipping options.

See [`SHOPIFY_INTEGRATION_PLAN.md`](SHOPIFY_INTEGRATION_PLAN.md) for full project documentation.

---

## Requirements

- Node.js 18+
- ngrok (for local Shopify testing)
- A Shopify dev store on the Advanced plan — see [`docs/DEV_STORE_SETUP.md`](docs/DEV_STORE_SETUP.md)

---

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**

Copy the variables below into a `.env` file in the project root:
```
PORT=3000
APP_URL=""                          # your ngrok HTTPS URL
SHOPIFY_CLIENT_ID=""                # from Dev Dashboard app
SHOPIFY_CLIENT_SECRET=""            # from Dev Dashboard app
SHOPIFY_SCOPES="write_shipping,read_orders"
SHOPIFY_SHOP_DOMAIN=""              # bare domain only — e.g. my-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=""             # populated automatically by OAuth flow
```

**3. Start ngrok**
```bash
ngrok http 3000
```
Copy the HTTPS forwarding URL into `APP_URL` in `.env`.

---

## Running Locally

**Start the dev server:**
```bash
npm run dev
```

The server starts on port 3000 and logs:
```
LTL Carrier Service running on port 3000
  Health:    http://localhost:3000/health
  OAuth:     http://localhost:3000/auth?shop=<your-store>.myshopify.com
  Rates:     POST http://localhost:3000/api/shopify/rates
```

---

## First-Time Shopify Setup

These steps are run once per environment to connect the app to a Shopify store.

**1. Run the OAuth flow**

With the server and ngrok running, open in a browser:
```
http://localhost:3000/auth?shop=<your-store>.myshopify.com
```
Approve the permissions in Shopify. The access token is written to `.env` automatically.

**2. Register the carrier service**
```bash
npm run register
```
This tells Shopify to call your app at checkout. Requires `SHOPIFY_ACCESS_TOKEN` and `APP_URL` to be set.

**3. Activate in store**

In the Shopify store admin: **Settings → Shipping and delivery → Manage rates → Add rate → Use carrier or app to calculate rates** → enable **LTL Freight**.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the server with ts-node (hot reload not included) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled app from `dist/` |
| `npm run register` | Register the carrier service callback URL with Shopify (one-time per environment) |

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns `{ "status": "ok" }` |
| `GET` | `/auth` | Starts OAuth flow — requires `?shop=` query param |
| `GET` | `/auth/callback` | OAuth callback — exchanges code for access token |
| `POST` | `/api/shopify/rates` | Carrier service rate endpoint — called by Shopify at checkout |

---

## Notes

- `SHOPIFY_SHOP_DOMAIN` must be the bare domain with no `https://` prefix
- The ngrok URL changes on every restart (free plan) — three places must be updated each time: `APP_URL` in `.env`, the redirect URL in the Dev Dashboard app config (under your app version), and the carrier service callback URL in Shopify (delete LTL Freight from **Settings → Shipping and delivery → Manage rates**, then re-run `npm run register`)
- The dev store location address must be fully populated (Settings → Locations) or Shopify will send null origin fields and no rates will be returned
- See [`docs/DEV_STORE_SETUP.md`](docs/DEV_STORE_SETUP.md) for full dev store setup instructions

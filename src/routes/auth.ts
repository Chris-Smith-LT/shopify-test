import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logger } from '../logger';

const router = Router();

// In-memory CSRF state store — keyed by shop domain
// Sufficient for single-developer POC on one process
const stateStore = new Map<string, string>();

// GET /auth?shop=my-store.myshopify.com
router.get('/auth', (req: Request, res: Response) => {
  const shop = req.query.shop as string;

  if (!shop) {
    res.status(400).send('Missing required query parameter: shop');
    return;
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const scopes = process.env.SHOPIFY_SCOPES;
  const appUrl = process.env.APP_URL;

  if (!clientId || !scopes) {
    res.status(500).send('SHOPIFY_CLIENT_ID or SHOPIFY_SCOPES not set in .env');
    return;
  }

  if (!appUrl) {
    res.status(500).send('APP_URL is not set in .env — set it to your current ngrok HTTPS URL');
    return;
  }

  const redirectUri = `${appUrl}/auth/callback`;
  const state = crypto.randomBytes(16).toString('hex');

  stateStore.set(shop, state);

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${clientId}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  logger.info({ shop }, 'Starting OAuth flow');
  res.redirect(authUrl);
});

// GET /auth/callback?code=...&state=...&shop=...
router.get('/auth/callback', async (req: Request, res: Response) => {
  const { shop, code, state } = req.query as Record<string, string>;

  if (!shop || !code || !state) {
    res.status(400).send('Missing required query parameters: shop, code, state');
    return;
  }

  const expectedState = stateStore.get(shop);
  if (!expectedState || expectedState !== state) {
    logger.warn({ shop }, 'State mismatch — possible CSRF attempt');
    res.status(403).send('State mismatch');
    return;
  }
  stateStore.delete(shop);

  try {
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const accessToken: string = tokenResponse.data.access_token;
    const tokenScope: string = tokenResponse.data.scope;

    logger.info({ shop, scopes: tokenScope }, 'OAuth token received');

    writeTokenToEnv(accessToken);
    logger.info({ shop }, 'Token written to .env as SHOPIFY_ACCESS_TOKEN');

    res.send(`
      <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
        <h2>OAuth Complete</h2>
        <p>Access token received and saved to <code>.env</code>.</p>
        <p><strong>Shop:</strong> ${shop}</p>
        <p><strong>Scopes:</strong> ${tokenScope}</p>
        <p>You can close this window. Next step: run <code>npm run register</code> to register the carrier service with Shopify.</p>
      </body></html>
    `);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ shop, err: message }, 'OAuth token exchange failed');
    res.status(500).send(`OAuth token exchange failed: ${message}`);
  }
});

// NOTE: writeTokenToEnv is for local development only.
// In production, replace this with a call to AWS Secrets Manager or Azure Key Vault.
// See PROD_INTEGRATION.md Step 7 — Secrets Migration.
function writeTokenToEnv(token: string): void {
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = '';

  try {
    envContent = fs.readFileSync(envPath, 'utf-8');
  } catch {
    envContent = '';
  }

  const tokenLine = `SHOPIFY_ACCESS_TOKEN="${token}"`;
  const tokenRegex = /^SHOPIFY_ACCESS_TOKEN=.*/m;

  if (tokenRegex.test(envContent)) {
    envContent = envContent.replace(tokenRegex, tokenLine);
  } else {
    envContent = envContent.trimEnd() + '\n' + tokenLine + '\n';
  }

  fs.writeFileSync(envPath, envContent, 'utf-8');
}

export default router;

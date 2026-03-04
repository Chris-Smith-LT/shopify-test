import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

export function verifyShopifyHmac(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];

  if (!hmacHeader || typeof hmacHeader !== 'string') {
    console.warn('[HMAC] Missing X-Shopify-Hmac-Sha256 header — rejecting request');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error('[HMAC] SHOPIFY_CLIENT_SECRET is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // req.body is a Buffer because the rates route uses express.raw()
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    console.error('[HMAC] req.body is not a Buffer — ensure express.raw() is applied before this middleware');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  // timingSafeEqual prevents timing attacks
  const digestBuffer = Buffer.from(digest);
  const headerBuffer = Buffer.from(hmacHeader);

  const signaturesMatch =
    digestBuffer.length === headerBuffer.length &&
    crypto.timingSafeEqual(digestBuffer, headerBuffer);

  if (!signaturesMatch) {
    console.warn('[HMAC] Signature mismatch — rejecting request');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

import express, { Router, Request, Response } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac';
import { TmsRateAdapter } from '../services/TmsRateAdapter';
import { RateCache } from '../services/RateCache';
import { ShopifyRateRequestBody, ShopifyRateResponse, ShopifyRateOption } from '../types/shopify';
import { TmsRateRequest, TmsRateResponse } from '../types/tms';
import { config } from '../config';
import { logger } from '../logger';

const GRAMS_PER_LB = 453.592;

function mapToShopifyRates(tmsResponse: TmsRateResponse): ShopifyRateOption[] {
  return tmsResponse.rates.map((tmsRate) => ({
    service_name: tmsRate.serviceName,
    service_code: tmsRate.serviceCode,
    total_price: tmsRate.totalCents.toString(),
    description: tmsRate.description,
    currency: tmsRate.currency,
    min_delivery_date: tmsRate.minDeliveryDate.toISOString(),
    max_delivery_date: tmsRate.maxDeliveryDate.toISOString(),
  }));
}

export function createRatesRouter(adapter: TmsRateAdapter): Router {
  const router = Router();
  const cache = new RateCache(config.cacheTtlMs);

  router.post(
    '/api/shopify/rates',
    express.raw({ type: 'application/json' }),
    verifyShopifyHmac,
    async (req: Request, res: Response) => {
      const startTime = Date.now();

      let body: ShopifyRateRequestBody;
      try {
        body = JSON.parse((req.body as Buffer).toString('utf-8'));
      } catch {
        logger.error('Failed to parse request body as JSON');
        res.status(400).json({ rates: [] });
        return;
      }

      const { rate } = body;

      if (!rate) {
        logger.warn('Request body missing top-level "rate" key');
        res.status(400).json({ rates: [] });
        return;
      }

      const { origin, destination, items, currency } = rate;

      if (!origin?.postal_code || !destination?.postal_code) {
        logger.warn('Missing origin or destination postal code — returning empty rates');
        res.json({ rates: [] });
        return;
      }

      // Warn on zero-gram items — indicates missing product weight data in Shopify
      const zeroWeightItems = items.filter((item) => !item.grams || item.grams <= 0);
      if (zeroWeightItems.length > 0) {
        logger.warn(
          { count: zeroWeightItems.length, skus: zeroWeightItems.map((i) => i.sku) },
          'Cart contains items with zero or missing weight — product data may be incomplete'
        );
      }

      const totalGrams = items.reduce((sum, item) => sum + item.grams * item.quantity, 0);
      const totalWeightLbs = totalGrams / GRAMS_PER_LB;

      if (totalGrams < config.ltlMinWeightGrams) {
        logger.info(
          { totalLbs: totalWeightLbs.toFixed(1), minLbs: (config.ltlMinWeightGrams / GRAMS_PER_LB).toFixed(0) },
          'Below LTL threshold — returning empty rates'
        );
        res.json({ rates: [] });
        return;
      }

      // Cache check — keyed by origin ZIP + destination ZIP + total grams
      const cached = cache.get(origin.postal_code, destination.postal_code, totalGrams);
      if (cached) {
        const elapsed = Date.now() - startTime;
        logger.info(
          { origin: origin.postal_code, destination: destination.postal_code, totalLbs: totalWeightLbs.toFixed(1), elapsed },
          'Cache hit — returning cached rates'
        );
        res.json({ rates: mapToShopifyRates(cached) } satisfies ShopifyRateResponse);
        return;
      }

      const tmsRequest: TmsRateRequest = {
        origin: {
          postalCode: origin.postal_code,
          city: origin.city,
          state: origin.province,
          country: origin.country,
        },
        destination: {
          postalCode: destination.postal_code,
          city: destination.city,
          state: destination.province,
          country: destination.country,
        },
        items: items.map((item) => ({
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          weightLbs: (item.grams * item.quantity) / GRAMS_PER_LB,
          priceCents: item.price,
        })),
        currency,
        totalWeightLbs,
      };

      try {
        logger.info(
          { origin: origin.postal_code, destination: destination.postal_code, totalLbs: totalWeightLbs.toFixed(1) },
          'Calling TMS'
        );

        const tmsResponse = await Promise.race([
          adapter.getRates(tmsRequest),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`TMS timeout after ${config.tmsTimeoutMs}ms`)),
              config.tmsTimeoutMs
            )
          ),
        ]);

        cache.set(origin.postal_code, destination.postal_code, totalGrams, tmsResponse);

        const shopifyRates = mapToShopifyRates(tmsResponse);
        const elapsed = Date.now() - startTime;

        logger.info(
          { origin: origin.postal_code, destination: destination.postal_code, totalLbs: totalWeightLbs.toFixed(1), rateCount: shopifyRates.length, elapsed },
          'Returning rates'
        );

        res.json({ rates: shopifyRates } satisfies ShopifyRateResponse);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const elapsed = Date.now() - startTime;

        if (message.includes('timeout')) {
          logger.warn(
            { origin: origin.postal_code, destination: destination.postal_code, elapsed },
            'TMS timeout — returning empty rates'
          );
        } else {
          logger.error(
            { origin: origin.postal_code, destination: destination.postal_code, elapsed, err: message },
            'TMS adapter error — returning empty rates'
          );
        }

        res.json({ rates: [] });
      }
    }
  );

  return router;
}

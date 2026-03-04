import express, { Router, Request, Response } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac';
import { TmsRateAdapter } from '../services/TmsRateAdapter';
import { ShopifyRateRequestBody, ShopifyRateResponse, ShopifyRateOption } from '../types/shopify';
import { TmsRateRequest } from '../types/tms';

const GRAMS_PER_LB = 453.592;
const DEFAULT_LTL_MIN_WEIGHT_GRAMS = 68039; // 150 lbs

export function createRatesRouter(adapter: TmsRateAdapter): Router {
  const router = Router();

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
        console.error('[Rates] Failed to parse request body as JSON');
        res.status(400).json({ rates: [] });
        return;
      }

      const { rate } = body;

      if (!rate) {
        console.warn('[Rates] Request body missing top-level "rate" key');
        res.status(400).json({ rates: [] });
        return;
      }

      const { origin, destination, items, currency } = rate;

      if (!origin?.postal_code || !destination?.postal_code) {
        console.warn('[Rates] Missing origin or destination postal code — returning empty rates');
        res.json({ rates: [] });
        return;
      }

      const totalGrams = items.reduce(
        (sum, item) => sum + item.grams * item.quantity,
        0
      );

      const minWeightGrams = parseInt(
        process.env.LTL_MIN_WEIGHT_GRAMS ?? String(DEFAULT_LTL_MIN_WEIGHT_GRAMS),
        10
      );

      if (totalGrams < minWeightGrams) {
        const totalLbs = totalGrams / GRAMS_PER_LB;
        console.log(
          `[Rates] Below LTL threshold: ${totalLbs.toFixed(1)} lbs ` +
          `(min: ${(minWeightGrams / GRAMS_PER_LB).toFixed(0)} lbs) — returning empty rates`
        );
        res.json({ rates: [] });
        return;
      }

      const totalWeightLbs = totalGrams / GRAMS_PER_LB;

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
        console.log(
          `[Rates] Calling TMS: ${origin.postal_code} → ${destination.postal_code}, ` +
          `${totalWeightLbs.toFixed(1)} lbs`
        );

        const tmsResponse = await adapter.getRates(tmsRequest);

        const shopifyRates: ShopifyRateOption[] = tmsResponse.rates.map((tmsRate) => ({
          service_name: tmsRate.serviceName,
          service_code: tmsRate.serviceCode,
          total_price: tmsRate.totalCents.toString(),
          description: tmsRate.description,
          currency: tmsRate.currency,
          min_delivery_date: tmsRate.minDeliveryDate.toISOString(),
          max_delivery_date: tmsRate.maxDeliveryDate.toISOString(),
        }));

        const elapsed = Date.now() - startTime;
        console.log(`[Rates] Returning ${shopifyRates.length} rate(s) in ${elapsed}ms`);

        const response: ShopifyRateResponse = { rates: shopifyRates };
        res.json(response);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const elapsed = Date.now() - startTime;
        console.error(`[Rates] Adapter error after ${elapsed}ms: ${message} — returning empty rates`);
        res.json({ rates: [] });
      }
    }
  );

  return router;
}

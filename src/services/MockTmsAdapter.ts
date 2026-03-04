import { TmsRateAdapter } from './TmsRateAdapter';
import { TmsRateRequest, TmsRateResponse } from '../types/tms';
import { logger } from '../logger';

export class MockTmsAdapter implements TmsRateAdapter {
  async getRates(request: TmsRateRequest): Promise<TmsRateResponse> {
    const now = new Date();

    const minDeliveryDate = new Date(now);
    minDeliveryDate.setDate(now.getDate() + 3);

    const maxDeliveryDate = new Date(now);
    maxDeliveryDate.setDate(now.getDate() + 7);

    logger.info(
      { origin: request.origin.postalCode, destination: request.destination.postalCode, totalLbs: request.totalWeightLbs.toFixed(1) },
      '[MockTmsAdapter] Returning hardcoded rate'
    );

    return {
      rates: [
        {
          serviceName: 'LTL Standard Freight',
          serviceCode: 'ltl-standard',
          totalCents: 28500,  // $285.00
          description: '',
          currency: request.currency,
          minDeliveryDate,
          maxDeliveryDate,
        },
      ],
    };
  }
}

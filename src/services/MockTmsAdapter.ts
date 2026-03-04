import { TmsRateAdapter } from './TmsRateAdapter';
import { TmsRateRequest, TmsRateResponse } from '../types/tms';

export class MockTmsAdapter implements TmsRateAdapter {
  async getRates(request: TmsRateRequest): Promise<TmsRateResponse> {
    const now = new Date();

    const minDeliveryDate = new Date(now);
    minDeliveryDate.setDate(now.getDate() + 3);

    const maxDeliveryDate = new Date(now);
    maxDeliveryDate.setDate(now.getDate() + 7);

    console.log(
      `[MockTmsAdapter] getRates: ${request.origin.postalCode} → ` +
      `${request.destination.postalCode}, ${request.totalWeightLbs.toFixed(1)} lbs`
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

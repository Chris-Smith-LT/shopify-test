import { TmsRateRequest, TmsRateResponse } from '../types/tms';

export interface TmsRateAdapter {
  getRates(request: TmsRateRequest): Promise<TmsRateResponse>;
}

import express from 'express';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import { createRatesRouter } from './routes/rates';
import { MockTmsAdapter } from './services/MockTmsAdapter';
import { TmsRateAdapter } from './services/TmsRateAdapter';

export function createApp(adapter?: TmsRateAdapter): express.Application {
  const app = express();

  // Use MockTmsAdapter by default — swap in RealTmsAdapter for production
  const tmsAdapter: TmsRateAdapter = adapter ?? new MockTmsAdapter();

  // Health check
  app.use(healthRouter);

  // OAuth routes — use query params only, no body parser needed
  app.use(authRouter);

  // Carrier service rate endpoint
  // express.raw() is applied at the route level inside createRatesRouter
  // so the raw Buffer is available for HMAC verification
  app.use(createRatesRouter(tmsAdapter));

  return app;
}

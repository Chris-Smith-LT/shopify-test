import { config } from './config';
import { logger } from './logger';
import { createApp } from './app';

const app = createApp();

const server = app.listen(config.port, () => {
  // Startup banner — intentionally human-readable, not a structured log event
  console.log(`\nLTL Carrier Service running on port ${config.port}`);
  console.log(`  Health:    http://localhost:${config.port}/health`);
  console.log(`  OAuth:     http://localhost:${config.port}/auth?shop=${config.shopifyShopDomain}`);
  console.log(`  Rates:     POST http://localhost:${config.port}/api/shopify/rates`);
  console.log('');
});

// Graceful shutdown — allows in-flight requests to complete before the container stops.
// SIGTERM is sent by Docker, App Runner, and App Service when stopping a container.
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

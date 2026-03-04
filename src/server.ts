import 'dotenv/config';
import { createApp } from './app';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const SHOP = process.env.SHOPIFY_SHOP_DOMAIN ?? '<your-store>.myshopify.com';

const app = createApp();

app.listen(PORT, () => {
  console.log(`\nLTL Carrier Service running on port ${PORT}`);
  console.log(`  Health:    http://localhost:${PORT}/health`);
  console.log(`  OAuth:     http://localhost:${PORT}/auth?shop=${SHOP}`);
  console.log(`  Rates:     POST http://localhost:${PORT}/api/shopify/rates`);
  console.log('');
});

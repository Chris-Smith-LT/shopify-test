import 'dotenv/config';
import axios from 'axios';

// Update to the current stable Shopify API version when building
// Versions are released quarterly: YYYY-01, YYYY-04, YYYY-07, YYYY-10
const SHOPIFY_API_VERSION = '2025-01';

async function registerCarrierService(): Promise<void> {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const appUrl = process.env.APP_URL;

  if (!accessToken) {
    console.error('ERROR: SHOPIFY_ACCESS_TOKEN is not set in .env');
    console.error('Run the OAuth flow first: start the app, then visit /auth?shop=<your-store>');
    process.exit(1);
  }

  if (!shopDomain) {
    console.error('ERROR: SHOPIFY_SHOP_DOMAIN is not set in .env');
    process.exit(1);
  }

  if (!appUrl) {
    console.error('ERROR: APP_URL is not set in .env');
    console.error('Start ngrok first: ngrok http 3000, then set APP_URL to the ngrok HTTPS URL');
    process.exit(1);
  }

  const callbackUrl = `${appUrl}/api/shopify/rates`;

  const mutation = `
    mutation CreateCarrierService($input: DeliveryCarrierServiceCreateInput!) {
      carrierServiceCreate(input: $input) {
        carrierService {
          id
          name
          callbackUrl
          active
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      name: 'LTL Freight',
      callbackUrl,
      supportsServiceDiscovery: true,
      active: true,
    },
  };

  console.log('Registering carrier service with Shopify...');
  console.log(`  Shop:         ${shopDomain}`);
  console.log(`  Callback URL: ${callbackUrl}`);

  try {
    const response = await axios.post(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
      }
    );

    const { data } = response;

    if (data.errors) {
      console.error('\nGraphQL errors:');
      console.error(JSON.stringify(data.errors, null, 2));
      process.exit(1);
    }

    const result = data.data?.carrierServiceCreate;

    if (!result) {
      console.error('\nUnexpected response:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    if (result.userErrors?.length > 0) {
      console.error('\nShopify errors:');
      result.userErrors.forEach((e: { field: string; message: string }) => {
        console.error(`  [${e.field}] ${e.message}`);
      });
      process.exit(1);
    }

    const cs = result.carrierService;
    console.log('\nCarrier service registered successfully:');
    console.log(`  ID:           ${cs.id}`);
    console.log(`  Name:         ${cs.name}`);
    console.log(`  Callback URL: ${cs.callbackUrl}`);
    console.log(`  Active:       ${cs.active}`);
    console.log('\nNext step: add an LTL-qualifying product to your dev store cart and proceed to checkout.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nRegistration failed: ${message}`);
    process.exit(1);
  }
}

registerCarrierService();

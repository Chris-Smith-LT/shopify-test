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

  const developerName = process.env.DEVELOPER_NAME;
  if (!developerName) {
    console.error('ERROR: DEVELOPER_NAME is not set in .env');
    console.error('Add DEVELOPER_NAME="Your Name" to .env — this identifies your carrier service on the shared dev store');
    process.exit(1);
  }

  const serviceName = `LTL Freight - ${developerName}`;
  const callbackUrl = `${appUrl}/api/shopify/rates`;

  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': accessToken,
  };
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  console.log('Registering carrier service with Shopify...');
  console.log(`  Shop:         ${shopDomain}`);
  console.log(`  Service name: ${serviceName}`);
  console.log(`  Callback URL: ${callbackUrl}`);

  try {
    // Step 1 — delete any existing carrier services registered by this app
    // Uses REST API for listing/deletion (reliable for reads; GraphQL query field is not stable)
    const restBase = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
    const restHeaders = { 'X-Shopify-Access-Token': accessToken };

    const listResponse = await axios.get(`${restBase}/carrier_services.json`, { headers: restHeaders });
    const existing: Array<{ id: number; name: string; callback_url: string }> =
      listResponse.data.carrier_services ?? [];

    if (existing.length > 0) {
      console.log(`\nFound ${existing.length} carrier service(s) on store — removing any owned by this app...`);
      for (const service of existing) {
        try {
          await axios.delete(`${restBase}/carrier_services/${service.id}.json`, { headers: restHeaders });
          console.log(`  Deleted: ${service.name}`);
        } catch {
          // 404 means this carrier service belongs to a different app — skip it
          console.log(`  Skipped: ${service.name} (owned by a different app)`);
        }
      }
    }

    // Step 2 — create fresh
    const createMutation = `
      mutation CreateCarrierService($input: DeliveryCarrierServiceCreateInput!) {
        carrierServiceCreate(input: $input) {
          carrierService { id name callbackUrl active }
          userErrors { field message }
        }
      }
    `;

    const createResponse = await axios.post(
      url,
      {
        query: createMutation,
        variables: {
          input: {
            name: serviceName,
            callbackUrl,
            supportsServiceDiscovery: true,
            active: true,
          },
        },
      },
      { headers }
    );

    const { data } = createResponse;

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
    console.log('\nNext step: activate LTL Freight in the store — Settings → Shipping and delivery → Manage rates → Add rate → Use carrier or app.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nRegistration failed: ${message}`);
    process.exit(1);
  }
}

registerCarrierService();

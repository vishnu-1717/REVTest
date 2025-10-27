# Disable Vercel Deployment Protection

Your production deployment has **Deployment Protection** enabled, which prevents external services (like whop.com) from sending webhooks to your API.

## 🛠️ How to Disable Deployment Protection

### Option 1: Disable for All Deployments (Recommended for APIs)

1. Go to your **Vercel Dashboard**
2. Select your project: `ben-crabbs-projects/saas`
3. Click **Settings** (gear icon in the top nav)
4. Go to **Security** section
5. Find **"Deployment Protection"**
6. Click **"Remove Protection"** or set it to **"No Protection"**
7. Save changes

This will make your webhook endpoint publicly accessible.

### Option 2: Bypass Protection for Specific Routes Only

If you want to keep protection enabled but allow webhooks:

1. In your Vercel project settings
2. Go to **Security** > **Deployment Protection**
3. Add a bypass pattern: `/api/webhooks/*`
4. Save changes

This allows only the webhook endpoint to be publicly accessible.

## ✅ After Disabling

Once you disable deployment protection:

```bash
# Test the webhook
./webhook-test.sh

# Or manually:
curl -X POST "https://saas-jsdbifi96-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=6cd16dd9-f693-47fa-957a-e224d244d4f2&secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "test_001",
      "amount": 50000,
      "currency": "USD",
      "customer_email": "test@example.com",
      "customer_name": "Test Customer"
    }
  }'
```

## 🔐 Security Note

Your webhook endpoint still has security:
- ✅ Company ID validation
- ✅ Secret authentication
- ✅ Only processes authorized requests
- ✅ Returns 401 for invalid credentials

So disabling deployment protection is safe - the webhook endpoint will still validate all requests.


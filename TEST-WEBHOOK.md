# Webhook Testing Instructions

## Once Vercel deployment completes:

### 1. Check your deployment status
Visit: https://vercel.com/dashboard
- Look for your "saas" project
- Make sure it shows "Ready" (green checkmark)

### 2. Get your latest deployment URL
- Click on your project
- Click on the latest deployment
- Copy the deployment URL (should be like: `https://saas-xyz123.vercel.app`)

### 3. Test your webhook
Run this command (replace `DEPLOYMENT_URL` with your actual URL):

```bash
curl -X POST "DEPLOYMENT_URL/api/webhooks/whop?company=6cd16dd9-f693-47fa-957a-e224d244d4f2&secret=1cbde82876797fef153edfcce52861d18b93290b9704fc343f2d77fd3845f2f3" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "test_sale_001",
      "amount": 50000,
      "currency": "USD",
      "customer_email": "bigclient@enterprise.com",
      "customer_name": "Enterprise Customer",
      "metadata": {
        "source": "referral"
      }
    }
  }'
```

### 4. Check your dashboard
Visit: `DEPLOYMENT_URL/dashboard`

You should see:
- Total Sales: $500.00
- Total Commissions: $50.00
- 1 sale in the Recent Sales table

## Expected Results

✅ **Successful webhook** will return: `{"received":true}`

✅ **Your dashboard** will show:
- Enterprise Customer
- $500.00 amount
- $50.00 commission

## Troubleshooting

If you get errors:
1. Make sure the deployment URL is correct
2. Check that Neon database credentials are set in Vercel
3. Wait a few minutes after adding env vars for deployment to complete
4. Check Vercel logs for any database connection errors

## Your Webhook URL for Whop:
```
DEPLOYMENT_URL/api/webhooks/whop?company=6cd16dd9-f693-47fa-957a-e224d244d4f2&secret=1cbde82876797fef153edfcce52861d18b93290b9704fc343f2d77fd3845f2f3
```

Copy this URL and add it to your Whop dashboard webhook configuration.


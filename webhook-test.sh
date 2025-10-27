#!/bin/bash

echo "🔔 Testing Production Webhook Endpoint"
echo ""

# NOTE: This deployment has Vercel deployment protection enabled
# You need to either:
# 1. Disable deployment protection in Vercel dashboard
# 2. Or get a bypass token and update the URL
#
# To disable deployment protection:
# - Go to your Vercel project settings
# - Navigate to Settings > Security
# - Disable "Deployment Protection" 
# - Or add your API routes to bypass protection
#
# Current URL: https://saas-jsdbifi96-ben-crabbs-projects.vercel.app

curl -X POST "https://saas-jsdbifi96-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=6cd16dd9-f693-47fa-957a-e224d244d4f2&secret=1cbde82876797fef153edfcce52861d18b93290b9704fc343f2d77fd3845f2f3" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "prod_test_'$(date +%s)'",
      "amount": 50000,
      "currency": "USD",
      "customer_email": "bigclient@enterprise.com",
      "customer_name": "Enterprise Customer",
      "metadata": {
        "source": "referral"
      }
    }
  }' \
  -w "\n✅ HTTP Status: %{http_code}\n"


# Webhook Testing Guide

Your app is ready to receive webhooks and display data! Here's what we verified:

## ✅ Testing Results

### 1. **Database Connection** ✓
- Successfully connected to Neon PostgreSQL database
- Company data verified (BudgetDog company found)

### 2. **Webhook Endpoint** ✓
- Endpoint accessible at: `/api/webhooks/whop`
- Authentication working (validates company ID and secret)
- Webhook received and processed successfully

### 3. **Data Processing** ✓
- Payment data stored correctly:
  - Sale: $500.00
  - Commission: $50.00 (10% of sale)
  - Customer: Enterprise Customer
  - Company: BudgetDog
- Webhook events logged

### 4. **Dashboard Display** ✓
- KPI Cards showing:
  - Total Sales: $500.00
  - Total Commissions: $50.00
  - Pending Commissions: $50.00
  - Avg Deal Size: $500.00
- Sales table displaying transaction details

### 5. **De-duplication** ✓
- Duplicate webhooks don't create duplicate sales
- Webhook events logged but sales not duplicated
- Data integrity maintained

## 🧪 Testing Locally

### Start your local dev server:
```bash
npm run dev
```

### Test the webhook:
```bash
curl -X POST "http://localhost:3000/api/webhooks/whop?company=6cd16dd9-f693-47fa-957a-e224d244d4f2&secret=1cbde82876797fef153edfcce52861d18b93290b9704fc343f2d77fd3845f2f3" \
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

### View the dashboard:
Open http://localhost:3000/dashboard in your browser

## 🚀 Testing in Production

### Step 1: Get Your Production URL

First, deploy your app to Vercel or get your current production URL:

```bash
# Option 1: Check existing deployment
vercel ls

# Option 2: Deploy if needed
vercel deploy --prod
```

### Step 2: Update webhook-test.sh

The URL in `webhook-test.sh` appears to be outdated. Update it with your current production URL:

```bash
# Edit webhook-test.sh and replace the URL
nano webhook-test.sh
# or
code webhook-test.sh
```

### Step 3: Test Your Production Webhook

Once you have the correct production URL, you can test it:

```bash
chmod +x webhook-test.sh
./webhook-test.sh
```

Or manually:
```bash
curl -X POST "YOUR_PRODUCTION_URL/api/webhooks/whop?company=6cd16dd9-f693-47fa-957a-e224d244d4f2&secret=1cbde82876797fef153edfcce52861d18b93290b9704fc343f2d77fd3845f2f3" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "prod_test_001",
      "amount": 50000,
      "currency": "USD",
      "customer_email": "customer@example.com",
      "customer_name": "Test Customer",
      "metadata": {
        "source": "web"
      }
    }
  }'
```

### Step 4: View Production Dashboard

Visit: `YOUR_PRODUCTION_URL/dashboard`

## 📊 Monitoring Webhooks

You can check webhook events in your database:

```bash
# Create a quick monitoring script
cat > check-data.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: 'desc' },
    include: { commission: true, company: true }
  });
  console.log('Recent Sales:', sales.length);
  sales.forEach(s => console.log(`${s.customerName}: $${s.amount} - Commission: $${s.commission?.amount || 0}`));
  
  const webhooks = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('\nRecent Webhooks:', webhooks.length);
  webhooks.forEach(w => console.log(`${w.eventType} - ${w.processed ? 'Processed' : 'Pending'}`));
  
  await prisma.$disconnect();
}

checkData();
EOF

node check-data.js
```

## 🔒 Security Notes

Your webhook endpoint:
- ✅ Validates company ID and secret
- ✅ Only processes payments for authenticated companies
- ✅ Returns 401 for invalid credentials
- ✅ Prevents duplicate sales
- ✅ Logs all webhook events for audit

## 🎯 Next Steps

1. **Find your production URL** and update `webhook-test.sh`
2. **Test the webhook** with the production script
3. **Verify data** appears in the dashboard
4. **Configure whop.com** to send webhooks to your production URL

## 💡 Tips

- Use different `externalId` values for each test to create multiple sales
- Check the webhook event logs to see processing status
- Monitor your database for new entries after webhook calls
- Use the dashboard to visually verify data is being stored correctly


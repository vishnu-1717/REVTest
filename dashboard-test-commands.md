# Dashboard Webhook Test Commands

These commands will create test data that shows up on your dashboard at:
**https://saas-c19plribk-ben-crabbs-projects.vercel.app/dashboard**

## Setup Required:
1. **Company ID**: Get from your database (the `id` field from your Company table)
2. **Secret**: Get from your database (the `processorAccountId` field from your Company table)

## Test Commands:

### 1. High-Value Sale ($500) - Will show prominently on dashboard
```bash
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=YOUR_COMPANY_ID&secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_dashboard_test_1",
      "amount": 50000,
      "currency": "USD",
      "customer_email": "bigclient@example.com",
      "customer_name": "Big Client Corp",
      "metadata": {
        "source": "dashboard_test",
        "product": "Premium Package"
      }
    },
    "created_at": "2024-01-15T14:30:00Z"
  }'
```

### 2. Multiple Small Sales ($50 each) - Will show multiple rows
```bash
# Sale 1
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=YOUR_COMPANY_ID&secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_dashboard_test_2a",
      "amount": 5000,
      "currency": "USD",
      "customer_email": "customer1@example.com",
      "customer_name": "John Smith",
      "metadata": {"source": "dashboard_test"}
    }
  }'

# Sale 2
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=YOUR_COMPANY_ID&secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_dashboard_test_2b",
      "amount": 5000,
      "currency": "USD",
      "customer_email": "customer2@example.com",
      "customer_name": "Jane Doe",
      "metadata": {"source": "dashboard_test"}
    }
  }'

# Sale 3
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=YOUR_COMPANY_ID&secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_dashboard_test_2c",
      "amount": 5000,
      "currency": "USD",
      "customer_email": "customer3@example.com",
      "customer_name": "Bob Johnson",
      "metadata": {"source": "dashboard_test"}
    }
  }'
```

### 3. Medium Sale ($200) - Will show good commission
```bash
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=YOUR_COMPANY_ID&secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_dashboard_test_3",
      "amount": 20000,
      "currency": "USD",
      "customer_email": "enterprise@example.com",
      "customer_name": "Enterprise Client",
      "metadata": {
        "source": "dashboard_test",
        "product": "Enterprise Plan"
      }
    },
    "created_at": "2024-01-15T15:00:00Z"
  }'
```

### 4. Recent Sale ($100) - Will show at top of table
```bash
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=YOUR_COMPANY_ID&secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_dashboard_test_4",
      "amount": 10000,
      "currency": "USD",
      "customer_email": "recent@example.com",
      "customer_name": "Recent Customer",
      "metadata": {
        "source": "dashboard_test",
        "product": "Basic Plan"
      }
    },
    "created_at": "2024-01-15T16:00:00Z"
  }'
```

## Expected Dashboard Results:

After running these commands, your dashboard should show:

- **Total Sales**: $900.00 (500 + 50 + 50 + 50 + 200 + 100)
- **Total Commissions**: $90.00 (10% of $900)
- **Pending Commissions**: $90.00 (all commissions start as pending)
- **Avg Deal Size**: $150.00 ($900 ÷ 6 sales)
- **Recent Sales Table**: 6 rows showing all the test sales

## Quick Setup:

1. **Get your Company ID and Secret**:
   ```bash
   # Run this to find your company details
   npx prisma studio
   # Or query your database directly
   ```

2. **Replace placeholders** in the commands above:
   - `YOUR_COMPANY_ID` → Your actual company ID
   - `YOUR_SECRET` → Your actual secret

3. **Run the commands** in your terminal

4. **Refresh your dashboard** to see the results!

## Pro Tip:
Run the commands in sequence, then refresh your dashboard after each one to see the numbers update in real-time! 🚀

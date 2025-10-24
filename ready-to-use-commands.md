# Ready-to-Use Dashboard Webhook Test Commands

**Your Dashboard**: https://saas-c19plribk-ben-crabbs-projects.vercel.app/dashboard

## Copy/Paste These Commands:

### 1. High-Value Sale ($500) - Will show prominently on dashboard
```bash
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=83161ed3-7d3d-43b9-af1e-35a8a4221174&secret=1a24abee49ee3337ba29486190753f9fef19d06f8ecd0af166af7d65d4b37f8f" \
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

**Sale 1:**
```bash
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=83161ed3-7d3d-43b9-af1e-35a8a4221174&secret=1a24abee49ee3337ba29486190753f9fef19d06f8ecd0af166af7d65d4b37f8f" \
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
```

**Sale 2:**
```bash
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=83161ed3-7d3d-43b9-af1e-35a8a4221174&secret=1a24abee49ee3337ba29486190753f9fef19d06f8ecd0af166af7d65d4b37f8f" \
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
```

**Sale 3:**
```bash
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=83161ed3-7d3d-43b9-af1e-35a8a4221174&secret=1a24abee49ee3337ba29486190753f9fef19d06f8ecd0af166af7d65d4b37f8f" \
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
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=83161ed3-7d3d-43b9-af1e-35a8a4221174&secret=1a24abee49ee3337ba29486190753f9fef19d06f8ecd0af166af7d65d4b37f8f" \
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
curl -X POST "https://saas-c19plribk-ben-crabbs-projects.vercel.app/api/webhooks/whop?company=83161ed3-7d3d-43b9-af1e-35a8a4221174&secret=1a24abee49ee3337ba29486190753f9fef19d06f8ecd0af166af7d65d4b37f8f" \
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

After running all commands, your dashboard will show:

- **Total Sales**: $900.00 (500 + 50 + 50 + 50 + 200 + 100)
- **Total Commissions**: $90.00 (10% of $900)
- **Pending Commissions**: $90.00 (all commissions start as pending)
- **Avg Deal Size**: $150.00 ($900 ÷ 6 sales)
- **Recent Sales Table**: 6 rows showing all test sales

## How to Use:

1. **Copy each command** above
2. **Paste into your terminal** and press Enter
3. **Refresh your dashboard** after each command to see the numbers update
4. **Watch the magic happen** as your dashboard populates with test data! 🚀

## Pro Tips:

- Run commands one at a time to see the dashboard update in real-time
- The "Recent Customer" sale will appear at the top (most recent)
- Each sale creates a 10% commission automatically
- All data will persist in your database

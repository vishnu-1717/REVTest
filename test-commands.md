# Whop Webhook Test Commands

Replace the placeholders with your actual values:
- `YOUR_VERCEL_DOMAIN` → Your actual Vercel domain (e.g., `https://saas-xyz123.vercel.app`)
- `COMPANY_ID` → Your company ID (e.g., `83161ed`)
- `SECRET` → Your actual secret from your database

## Test 1: Payment Success Webhook
```bash
curl -X POST "https://YOUR_VERCEL_DOMAIN/api/webhooks/whop?company=COMPANY_ID&secret=SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_test_12345",
      "amount": 5000,
      "currency": "USD",
      "customer_email": "test@example.com",
      "customer_name": "Test Customer",
      "metadata": {
        "source": "test_webhook",
        "product_id": "prod_123"
      }
    },
    "created_at": "2024-01-15T10:30:00Z"
  }'
```

## Test 2: Dispute Alert Created
```bash
curl -X POST "https://YOUR_VERCEL_DOMAIN/api/webhooks/whop?company=COMPANY_ID&secret=SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "dispute_alert_created",
    "data": {
      "id": "dispute_alert_67890",
      "amount": 2500,
      "currency": "USD",
      "customer_email": "dispute@example.com",
      "customer_name": "Dispute Customer",
      "reason": "fraudulent",
      "status": "open"
    },
    "created_at": "2024-01-15T11:00:00Z"
  }'
```

## Test 3: Dispute Created
```bash
curl -X POST "https://YOUR_VERCEL_DOMAIN/api/webhooks/whop?company=COMPANY_ID&secret=SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "dispute_created",
    "data": {
      "id": "dispute_54321",
      "amount": 10000,
      "currency": "USD",
      "customer_email": "chargeback@example.com",
      "customer_name": "Chargeback Customer",
      "reason": "product_not_received",
      "status": "needs_response"
    },
    "created_at": "2024-01-15T12:00:00Z"
  }'
```

## Test 4: Error Handling (Invalid Credentials)
```bash
curl -X POST "https://YOUR_VERCEL_DOMAIN/api/webhooks/whop?company=invalid_company&secret=invalid_secret" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_error_test",
      "amount": 1000,
      "currency": "USD"
    }
  }'
```

## What Each Test Does:

1. **Payment Success**: Creates a $50.00 sale and calculates 10% commission ($5.00)
2. **Dispute Alert**: Tests dispute alert handling
3. **Dispute Created**: Tests dispute creation handling  
4. **Error Handling**: Tests authentication failure (should return 401)

## Expected Results:

- **Test 1**: Should create a Sale record and Commission record
- **Test 2**: Should create a WebhookEvent record
- **Test 3**: Should create a WebhookEvent record
- **Test 4**: Should return 401 Unauthorized

## Quick Setup:

1. Get your Vercel domain from your deployment
2. Get your company ID and secret from your database
3. Replace the placeholders in the commands above
4. Run each command in your terminal
5. Check your database to see the created records

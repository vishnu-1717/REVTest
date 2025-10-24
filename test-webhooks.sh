#!/bin/bash

# Test Webhook Commands for Whop Integration
# Replace YOUR_VERCEL_DOMAIN with your actual Vercel domain
# Replace COMPANY_ID with your actual company ID
# Replace SECRET with your actual secret

DOMAIN="https://your-app.vercel.app"
COMPANY_ID="83161ed"
SECRET="your-secret-here"

echo "🧪 Testing Whop Webhooks..."
echo "Domain: $DOMAIN"
echo "Company ID: $COMPANY_ID"
echo ""

# Test 1: Payment Success Event
echo "1️⃣ Testing Payment Success Webhook..."
curl -X POST "$DOMAIN/api/webhooks/whop?company=$COMPANY_ID&secret=$SECRET" \
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

echo -e "\n\n"

# Test 2: Dispute Alert Created
echo "2️⃣ Testing Dispute Alert Created Webhook..."
curl -X POST "$DOMAIN/api/webhooks/whop?company=$COMPANY_ID&secret=$SECRET" \
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

echo -e "\n\n"

# Test 3: Dispute Created
echo "3️⃣ Testing Dispute Created Webhook..."
curl -X POST "$DOMAIN/api/webhooks/whop?company=$COMPANY_ID&secret=$SECRET" \
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

echo -e "\n\n"

# Test 4: Invalid Company/Secret (Error Handling)
echo "4️⃣ Testing Error Handling with Invalid Credentials..."
curl -X POST "$DOMAIN/api/webhooks/whop?company=invalid_company&secret=invalid_secret" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_error_test",
      "amount": 1000,
      "currency": "USD"
    }
  }'

echo -e "\n\n"
echo "✅ All webhook tests completed!"
echo "Check your database to see the created records."

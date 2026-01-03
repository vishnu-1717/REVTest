#!/bin/bash

echo "🚀 Testing GHL Marketplace Webhook (Localhost)"
echo ""

# Generate a timestamp and signature (mock)
# In a real scenario, you'd need the real secret to generate a valid signature
# or disable verification temporarily in code if testing without secret.
TIMESTAMP=$(date +%s)

echo "1. Testing Appointment Created..."
curl -X POST "http://localhost:3000/api/webhooks/ghl/marketplace" \
  -H "Content-Type: application/json" \
  -H "x-ghl-timestamp: $TIMESTAMP" \
  -H "x-ghl-signature: mock_signature_for_local_testing" \
  -d '{
    "type": "appointment.created",
    "locationId": "test_location_123",
    "appointment": {
        "id": "apt_test_001",
        "title": "Test Appointment",
        "startTime": "'$(date -v+1d +%Y-%m-%dT%H:%M:%S%z 2>/dev/null || date -d "+1 day" +%Y-%m-%dT%H:%M:%S%z)'",
        "endTime": "'$(date -v+1d -v+30M +%Y-%m-%dT%H:%M:%S%z 2>/dev/null || date -d "+1 day 30 minutes" +%Y-%m-%dT%H:%M:%S%z)'",
        "status": "booked",
        "contact": {
            "id": "cont_test_001",
            "name": "Test Contact"
        }
    }
  }' \
  -w "\nResponse: %{http_code}\n"

echo ""
echo "2. Testing Appointment Updated..."
curl -X POST "http://localhost:3000/api/webhooks/ghl/marketplace" \
  -H "Content-Type: application/json" \
  -H "x-ghl-timestamp: $TIMESTAMP" \
  -H "x-ghl-signature: mock_signature_for_local_testing" \
  -d '{
    "type": "appointment.updated",
    "locationId": "test_location_123",
    "appointment": {
        "id": "apt_test_001",
        "title": "Test Appointment Updated",
        "status": "confirmed"
    }
  }' \
  -w "\nResponse: %{http_code}\n"

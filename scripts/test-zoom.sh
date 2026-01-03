#!/bin/bash

# Default secret for testing - matches what you might set in .env.local for testing
# If you have a real ZOOM_WEBHOOK_SECRET in .env.local, set it here to match
SECRET="${ZOOM_WEBHOOK_SECRET:-test_secret}"

echo "🚀 Testing Zoom Webhook (Localhost)"
echo "Using Secret: $SECRET"
echo ""

TIMESTAMP=$(date +%s)
PAYLOAD='{
  "event": "recording.completed",
  "payload": {
    "account_id": "test_account_id",
    "object": {
      "id": "123456789",
      "topic": "Test Meeting",
      "start_time": "2023-10-27T10:00:00Z",
      "duration": 60,
      "recording_files": [
        {
          "id": "file_1",
          "file_type": "TRANSCRIPT",
          "file_extension": "vtt",
          "download_url": "https://example.com/transcript.vtt"
        }
      ]
    }
  }
}'

# Create signature
# formatting as v0:timestamp:payload
STRING_TO_SIGN="v0:${TIMESTAMP}:${PAYLOAD}"
SIGNATURE=$(echo -n "${STRING_TO_SIGN}" | openssl dgst -sha256 -hmac "${SECRET}" -hex | sed 's/^.* //')
FULL_SIGNATURE="v0=${SIGNATURE}"

echo "Sending Payload..."

curl -X POST "http://localhost:3000/api/webhooks/zoom" \
  -H "Content-Type: application/json" \
  -H "x-zm-request-timestamp: $TIMESTAMP" \
  -H "x-zm-signature: $FULL_SIGNATURE" \
  -d "$PAYLOAD" \
  -w "\nResponse: %{http_code}\n"

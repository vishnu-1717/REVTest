# GHL Marketplace Webhook Debugging Guide

## Issue: Webhooks Not Coming Through

If GHL Marketplace webhooks aren't appearing in your webhook events viewer, follow these steps:

## Step 1: Verify Webhook Endpoint is Accessible

Test if the endpoint is reachable:

```bash
# Test GET endpoint (shows configuration status)
curl https://app.revphlo.com/api/webhooks/ghl/marketplace/test

# Test POST endpoint (simulates webhook)
curl -X POST https://app.revphlo.com/api/webhooks/ghl/marketplace/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Expected Response:**
```json
{
  "status": "ok",
  "endpoint": "/api/webhooks/ghl/marketplace",
  "message": "GHL Marketplace webhook endpoint is accessible",
  "environment": {
    "hasWebhookSecret": true,
    "webhookSecretLength": 64
  }
}
```

## Step 2: Check GHL Marketplace App Configuration

1. **Go to GHL Marketplace Dashboard**
   - Navigate to your app settings
   - Go to **Webhooks** section

2. **Verify Webhook URL**
   - Should be: `https://app.revphlo.com/api/webhooks/ghl/marketplace`
   - **NOT**: `https://app.revphlo.com/api/webhooks/ghl` (old legacy endpoint)

3. **Verify Webhook Events Enabled**
   - ✅ `appointmentCreate` or `appointment.created`
   - ✅ `appointmentUpdate` or `appointment.updated`
   - ✅ `appointmentCancel` or `appointment.cancelled`
   - ✅ `appointmentReschedule` or `appointment.rescheduled`

4. **Check Webhook Secret**
   - Copy the webhook signing secret
   - Verify it matches `GHL_MARKETPLACE_WEBHOOK_SECRET` in Vercel environment variables

## Step 3: Check Environment Variables

In your Vercel project settings, verify:

1. **GHL_MARKETPLACE_WEBHOOK_SECRET**
   - Should be set to the webhook secret from GHL Marketplace
   - Should be a long string (typically 32-64 characters)

2. **GHL_MARKETPLACE_CLIENT_ID**
   - Your Marketplace app client ID

3. **GHL_MARKETPLACE_CLIENT_SECRET**
   - Your Marketplace app client secret

## Step 4: Check Server Logs

After deploying the updated code with logging, check Vercel server logs:

1. Go to Vercel Dashboard → Your Project → **Logs**
2. Filter for: `[GHL Marketplace Webhook]`
3. Look for:
   - `===== INCOMING WEBHOOK =====` - Confirms webhook reached endpoint
   - `Signature verification result: true/false` - Shows if signature is valid
   - `Extracted locationId: ...` - Shows if locationId was found
   - `Company lookup result: ...` - Shows if company was found

## Step 5: Check Webhook Events Viewer

1. Go to `/admin/integrations/webhooks` in your app
2. Filter by processor: `ghl_marketplace`
3. Look for:
   - **Recent events** - Shows if webhooks are being received
   - **Error messages** - Shows why webhooks failed
   - **Payload structure** - Shows what GHL is sending

## Common Issues & Solutions

### Issue 1: "Invalid signature" Error

**Symptoms:**
- Webhook events show `error: 'Invalid webhook signature'`
- Server logs show `Signature verification result: false`

**Solutions:**
1. Verify `GHL_MARKETPLACE_WEBHOOK_SECRET` matches the secret in GHL Marketplace
2. Check if secret has any extra spaces or newlines
3. Regenerate webhook secret in GHL Marketplace and update Vercel env var
4. Redeploy after updating environment variable

### Issue 2: "Company not found" Error

**Symptoms:**
- Webhook events show `error: 'Company not found for locationId: ...'`
- Server logs show `Company lookup result: Not found`

**Solutions:**
1. Check if `ghlLocationId` is set in your Company record
2. Verify the `locationId` in the webhook payload matches your stored `ghlLocationId`
3. Check server logs for "Companies with location IDs" to see what's stored
4. The `locationId` should have been saved during OAuth callback

### Issue 3: "No locationId or accountId in payload"

**Symptoms:**
- Webhook events show `error: 'No locationId or accountId in payload'`
- Server logs show locationId extraction attempts failing

**Solutions:**
1. Check the webhook payload structure in the events viewer
2. GHL Marketplace webhooks should include `locationId` at root level or in `location.id`
3. If payload structure is different, we may need to update the extraction logic
4. Check GHL Marketplace documentation for webhook payload format

### Issue 4: Webhooks Not Reaching Endpoint

**Symptoms:**
- No webhook events in the viewer
- No logs in Vercel
- Test endpoint works but no actual webhooks

**Solutions:**
1. Verify webhook URL in GHL Marketplace is correct
2. Check if Vercel deployment protection is blocking webhooks
3. Test endpoint manually: `curl -X POST https://app.revphlo.com/api/webhooks/ghl/marketplace/test`
4. Check GHL Marketplace webhook delivery logs (if available)
5. Verify webhook events are enabled in GHL Marketplace app settings

### Issue 5: Event Type Not Handled

**Symptoms:**
- Webhook events show `processed: true` but no error
- Server logs show `Unhandled event type: ...`

**Solutions:**
1. Check what event type GHL is sending (in webhook payload)
2. We currently handle:
   - `appointment.created`, `appointmentCreate`, `appointment_create`
   - `appointment.updated`, `appointmentUpdate`, `appointment_update`
   - `appointment.cancelled`, `appointmentCancel`, `appointment_cancelled`
   - `appointment.rescheduled`, `appointmentReschedule`, `appointment_rescheduled`
3. If GHL sends a different format, we may need to add it to the switch statement

## Step 6: Test Webhook Manually

You can test the webhook endpoint manually to verify it's working:

```bash
# Replace with your actual values
LOCATION_ID="IKw1E7VUZwSDe8WFAxIM"
WEBHOOK_SECRET="your_webhook_secret_here"

# Generate signature (HMAC-SHA256 of timestamp.payload)
TIMESTAMP=$(date +%s)
PAYLOAD='{"type":"appointment.created","locationId":"'$LOCATION_ID'","appointment":{"id":"test123","startTime":"2024-01-01T10:00:00Z"}}'
SIGNATURE=$(echo -n "$TIMESTAMP.$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

curl -X POST https://app.revphlo.com/api/webhooks/ghl/marketplace \
  -H "Content-Type: application/json" \
  -H "x-ghl-signature: $SIGNATURE" \
  -H "x-ghl-timestamp: $TIMESTAMP" \
  -d "$PAYLOAD"
```

## Next Steps

1. **Check Vercel logs** after the next webhook attempt
2. **Review webhook events** in `/admin/integrations/webhooks`
3. **Compare locationId** in webhook payload vs database
4. **Verify webhook secret** matches between GHL and Vercel
5. **Test endpoint** using the test route to confirm accessibility

## Additional Debugging

If webhooks still aren't working:

1. **Check GHL Marketplace webhook delivery status** (if available in dashboard)
2. **Verify OAuth connection** - ensure `ghlLocationId` was saved during OAuth
3. **Check database** - query `Company` table to verify `ghlLocationId` is set
4. **Review recent commits** - ensure webhook handler wasn't accidentally broken

## Support

If you've checked all of the above and webhooks still aren't working:
1. Share the Vercel server logs (filtered for `[GHL Marketplace Webhook]`)
2. Share a webhook event payload from the events viewer
3. Share the `locationId` from your Company record
4. Share the webhook URL configured in GHL Marketplace


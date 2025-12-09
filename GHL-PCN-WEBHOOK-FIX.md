# Fixing GHL PCN Survey Webhook Issues

## Problems Identified

1. **Outdated Webhook URL**: The webhook URL in GHL is still pointing to the old domain (`cleansalesdata.com`) instead of the new domain (`app.revphlo.com`)
2. **Invalid Secret Error (403)**: The webhook secret validation is failing, likely because the secret wasn't set when switching from API key to OAuth

## Solutions Implemented

### 1. Updated Webhook Handler
- The webhook handler now checks both `ghlWebhookSecret` and `ghlMarketplaceWebhookSecret` fields
- Added better error logging to help diagnose secret validation issues

### 2. Webhook Secret Management API
- **GET** `/api/admin/integrations/ghl/webhook-secret` - Retrieve current webhook URL and secret
- **POST** `/api/admin/integrations/ghl/webhook-secret` - Generate a new webhook secret

### 3. Script to Generate Secrets
- Created `scripts/generate-ghl-pcn-webhook-secrets.ts` to generate secrets for all companies

## How to Fix

### Step 1: Generate Webhook Secrets

Run the script to generate webhook secrets for all companies:

```bash
npx tsx scripts/generate-ghl-pcn-webhook-secrets.ts
```

This will:
- Generate secrets for companies that don't have one
- Show the webhook URL for each company
- Update both `ghlWebhookSecret` and `ghlMarketplaceWebhookSecret` fields

### Step 2: Update Webhook URL in GHL

For each company, you need to update the webhook URL in GHL:

1. **Log into GHL** for the company
2. **Go to Workflows/Automations** where the PCN survey webhook is configured
3. **Find the webhook action** that sends PCN survey data
4. **Update the webhook URL** to:
   ```
   https://app.revphlo.com/api/webhooks/ghl/pcn-survey?company={COMPANY_ID}&secret={SECRET}
   ```

   Replace:
   - `{COMPANY_ID}` with the actual company ID
   - `{SECRET}` with the webhook secret for that company

### Step 3: Get the Webhook URL for a Company

You can retrieve the webhook URL for a specific company using the API:

**Via API:**
```bash
# Get webhook URL for a company
curl "https://app.revphlo.com/api/admin/integrations/ghl/webhook-secret?viewAs={COMPANY_ID}" \
  -H "Cookie: your-auth-cookie"
```

**Via Admin UI (to be added):**
- Navigate to `/admin/integrations/ghl/setup?viewAs={COMPANY_ID}`
- The webhook URL should be displayed there

### Step 4: Regenerate Secret (if needed)

If you need to regenerate a secret for a specific company:

```bash
# Generate new secret
curl -X POST "https://app.revphlo.com/api/admin/integrations/ghl/webhook-secret?viewAs={COMPANY_ID}" \
  -H "Cookie: your-auth-cookie"
```

This will return:
```json
{
  "companyId": "...",
  "companyName": "...",
  "secret": "new-secret-here",
  "webhookUrl": "https://app.revphlo.com/api/webhooks/ghl/pcn-survey?company=...&secret=...",
  "message": "Webhook secret generated successfully. Update the webhook URL in GHL with the new URL."
}
```

## Important Notes

1. **PCN Survey Webhook vs Marketplace Webhooks**
   - The PCN survey webhook (`/api/webhooks/ghl/pcn-survey`) is separate from marketplace webhooks
   - It's configured in GHL workflows/automations, not in the marketplace app settings
   - This webhook receives form submissions from GHL surveys

2. **Secret Security**
   - The webhook secret is used to verify that webhooks are coming from GHL
   - Keep the secret secure and don't expose it in logs or public URLs
   - If a secret is compromised, regenerate it immediately

3. **Domain Update**
   - Make sure all webhook URLs in GHL use `app.revphlo.com` (not `cleansalesdata.com`)
   - The old domain may still be configured in GHL workflows

## Testing

After updating the webhook URL in GHL:

1. **Submit a test PCN** from GHL
2. **Check the webhook events** in `/admin/integrations/webhooks`
3. **Verify the PCN was submitted** in the appointments list
4. **Check for any errors** in the webhook event logs

## Troubleshooting

### Still getting 403 errors?

1. **Verify the secret matches**: Check that the secret in the GHL webhook URL matches the secret in the database
2. **Check the company ID**: Make sure the `company` parameter in the URL matches the actual company ID
3. **Regenerate the secret**: If in doubt, regenerate the secret and update GHL

### Webhook not receiving data?

1. **Check GHL workflow**: Verify the workflow is active and triggering
2. **Check webhook URL**: Make sure the URL in GHL is correct (new domain, correct parameters)
3. **Check webhook events**: Look at `/admin/integrations/webhooks` to see if webhooks are being received

### Need to find a company's webhook URL?

Use the API endpoint or check the database:
```sql
SELECT id, name, ghlWebhookSecret 
FROM "Company" 
WHERE id = 'your-company-id';
```

Then construct the URL:
```
https://app.revphlo.com/api/webhooks/ghl/pcn-survey?company={id}&secret={ghlWebhookSecret}
```


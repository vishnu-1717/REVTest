# GHL Marketplace App Setup Checklist

## Overview
This document outlines what needs to be configured in your GHL Marketplace app before implementing the OAuth integration in your platform.

## ✅ Already Configured

Based on your screenshot and description, you have:

1. **Scopes Selected** ✅
   - `calendars.readonly`
   - `calendars/events.readonly`
   - `contacts.readonly`
   - `users.readonly`
   - `opportunities.readonly`
   - `opportunities.write`
   - `locations/customFields.readonly`
   - `locations/customValues.readonly`
   - `locations.readonly`
   - `conversations.readonly`
   - `conversations/message.readonly`
   - `locations/tags.readonly`

2. **Webhook Events Enabled** ✅
   - `appointmentCreate`
   - `contactCreate`
   - `contactUpdate`
   - `opportunityCreate`
   - `opportunityStatusUpdate`
   - `opportunityStageUpdate`

## 🔧 Required Configuration Steps

### 1. OAuth Configuration

#### Redirect URI
- **Location**: App Settings → OAuth Configuration
- **Action**: Add your OAuth callback URL
  - Format: `https://yourdomain.com/api/integrations/ghl/oauth/callback`
  - Or for local dev: `http://localhost:3000/api/integrations/ghl/oauth/callback`
- **Note**: GHL may require HTTPS in production

#### OAuth Scopes Verification
- Verify all scopes listed above are selected
- Ensure `opportunities.write` is enabled (needed for updating pipeline stages)

### 2. Webhook Configuration

#### Webhook URL
- **Location**: App Settings → Webhooks
- **Action**: Set your webhook endpoint URL
  - Format: `https://yourdomain.com/api/webhooks/ghl/marketplace`
  - **Important**: This should be a different endpoint than your current `/api/webhooks/ghl/route.ts` to handle Marketplace app webhooks separately

#### Webhook Events Verification
Verify these events are enabled:
- ✅ `appointmentCreate` - New appointments
- ✅ `contactCreate` - New contacts
- ✅ `contactUpdate` - Contact updates
- ⚠️ **ADD**: `appointmentUpdate` - For reschedules, cancellations, transfers
- ⚠️ **ADD**: `appointmentCancel` - Explicit cancellation events
- ⚠️ **ADD**: `appointmentReschedule` - Explicit reschedule events
- ✅ `opportunityCreate` - New opportunities
- ✅ `opportunityStatusUpdate` - Opportunity status changes
- ✅ `opportunityStageUpdate` - Pipeline stage changes

**Note**: You may need to add `appointmentUpdate`, `appointmentCancel`, and `appointmentReschedule` if they're available as separate events. If not, `appointmentCreate` with different statuses should work.

#### Webhook Secret
- **Location**: App Settings → Webhooks
- **Action**: Generate and save the webhook signing secret
- **Storage**: Store this in your environment variables as `GHL_MARKETPLACE_WEBHOOK_SECRET`
- **Usage**: Verify webhook signatures to ensure authenticity

### 3. App Installation Settings

#### Installation Flow
- **Location**: App Settings → Installation
- **Action**: Configure installation settings
  - Allow users to install the app from your platform
  - Set installation redirect URL (where users go after OAuth)
  - Format: `https://yourdomain.com/integrations/ghl/connected`

#### Required Permissions
- Ensure the app requests all necessary permissions during installation
- Users should see a clear list of what the app will access

### 4. App Credentials

#### Client ID & Client Secret
- **Location**: App Settings → Credentials
- **Action**: Save these credentials
  - `GHL_MARKETPLACE_CLIENT_ID` - Your app's client ID
  - `GHL_MARKETPLACE_CLIENT_SECRET` - Your app's client secret (keep secure!)
- **Storage**: Add to your environment variables

#### API Base URL
- **Location**: App Settings → API
- **Action**: Note the API base URL (usually `https://services.leadconnectorhq.com`)
- **Version**: Verify API version (v1 or v2)

### 5. Additional Webhook Events to Consider

Based on your requirements, you may want to add:

#### Appointment Transfer Events
- Check if GHL has: `appointmentTransfer` or `appointmentReassign`
- If not available, `appointmentUpdate` with `assignedUserId` change should work

#### Calendar Events
- `calendarCreate` - New calendars added
- `calendarUpdate` - Calendar changes
- Useful for syncing calendar list

### 6. Testing Configuration

#### Test Mode
- **Location**: App Settings → Testing
- **Action**: Enable test mode if available
- **Purpose**: Test OAuth flow and webhooks without affecting production data

#### Test Account
- Create a test GHL account
- Install your app in test mode
- Verify all webhook events fire correctly

## 📋 Pre-Implementation Checklist

Before you start coding, ensure:

- [ ] OAuth redirect URI is configured
- [ ] Webhook URL is set and accessible
- [ ] Webhook secret is generated and saved
- [ ] Client ID and Client Secret are saved
- [ ] All required scopes are selected
- [ ] All required webhook events are enabled
- [ ] Test mode is available (if needed)
- [ ] App can be installed from your platform

## 🔐 Security Considerations

1. **Webhook Verification**
   - Always verify webhook signatures using the webhook secret
   - Reject unsigned or invalid webhooks

2. **OAuth State Parameter**
   - Use a random state parameter in OAuth flow
   - Verify state on callback to prevent CSRF attacks

3. **Token Storage**
   - Store OAuth tokens securely (encrypted)
   - Implement token refresh logic
   - Never expose tokens in client-side code

4. **Scope Validation**
   - Verify the installed app has all required scopes
   - Handle cases where users revoke permissions

## 📝 Database Schema Updates Needed

You'll need to update your `Company` model to store OAuth tokens instead of API keys:

```prisma
model Company {
  // ... existing fields ...
  
  // OLD: Direct API key integration
  // ghlApiKey        String?
  // ghlLocationId    String?
  
  // NEW: Marketplace OAuth integration
  ghlOAuthAccessToken  String?  // OAuth access token
  ghlOAuthRefreshToken  String?  // OAuth refresh token
  ghlOAuthExpiresAt     DateTime? // Token expiration
  ghlLocationId         String?  // Primary location ID (from OAuth)
  ghlAppInstalledAt     DateTime? // When app was installed
  ghlAppUninstalledAt   DateTime? // When app was uninstalled
  ghlWebhookSecret      String?  // Webhook signing secret (per-installation)
}
```

## 🚀 Next Steps After Configuration

1. **OAuth Flow Implementation**
   - Create OAuth initiation endpoint
   - Create OAuth callback handler
   - Store tokens securely

2. **Token Management**
   - Implement token refresh logic
   - Handle token expiration
   - Handle app uninstallation

3. **Webhook Handler**
   - Create new Marketplace webhook endpoint
   - Verify webhook signatures
   - Route events to existing handlers

4. **API Client Update**
   - Update `GHLClient` to use OAuth tokens
   - Remove API key dependency
   - Add token refresh logic

5. **UI Updates**
   - Replace API key input with "Connect GHL" button
   - Show connection status
   - Add disconnect/uninstall option

## 📚 GHL Marketplace API Documentation

Refer to GHL's Marketplace API documentation for:
- OAuth flow details
- Webhook payload structures
- Token refresh endpoints
- API endpoint URLs

## ⚠️ Important Notes

1. **Backward Compatibility**: You may want to support both API key and OAuth methods during migration
2. **Multiple Locations**: GHL accounts can have multiple locations - decide how to handle this
3. **Token Refresh**: OAuth tokens expire - implement automatic refresh
4. **Webhook Payloads**: Marketplace webhooks may have different structure than direct API webhooks
5. **Rate Limits**: Marketplace apps may have different rate limits than direct API access

## 🔍 Verification Steps

Before coding, test these in GHL Marketplace dashboard:

1. **OAuth Flow**
   - Click "Install App" in your app listing
   - Verify redirect to your OAuth URL
   - Complete OAuth flow
   - Verify tokens are received

2. **Webhook Delivery**
   - Create a test appointment in GHL
   - Verify webhook is sent to your endpoint
   - Check webhook payload structure
   - Verify signature validation works

3. **Scope Access**
   - Make API calls with OAuth token
   - Verify all scoped endpoints are accessible
   - Test `opportunities.write` for pipeline updates

---

**Once all items above are configured, you're ready to begin coding the integration!**


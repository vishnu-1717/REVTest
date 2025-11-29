# GHL OAuth Webhooks: Data Flow & Audit Trail

## Overview

GHL integration uses **OAuth (Marketplace App)** for all data intake:
- Real-time webhooks from GHL Marketplace
- Secure OAuth token-based authentication
- Official GHL Marketplace webhook format

**Note**: Legacy API key webhooks are no longer supported. All integrations must use OAuth.

---

## Data Sources Comparison

### OAuth (Marketplace App) - `/api/webhooks/ghl/marketplace`

**What it is**: Webhooks sent by GHL when your Marketplace app is installed. These are official GHL Marketplace webhooks.

**When data comes in**:
- App installation/uninstallation
- Appointment created/updated/cancelled/rescheduled
- Contact created/updated
- Opportunity created/updated

**Webhook URL**: `https://app.revphlo.com/api/webhooks/ghl/marketplace`

**Authentication**: 
- Uses webhook signature verification (`x-ghl-signature` header)
- Secret stored in `GHL_MARKETPLACE_WEBHOOK_SECRET` env variable

**Payload Structure**:
```json
{
  "type": "appointment.created",
  "appointmentId": "...",
  "locationId": "...",
  "companyId": "...",
  "appointment": {
    "id": "...",
    "startTime": "...",
    "endTime": "...",
    "status": "...",
    "calendarId": "...",
    "contactId": "..."
  }
}
```

**Key Differences**:
- Includes `locationId` and `companyId` in payload
- More structured event types (`appointment.created`, `appointment.updated`)
- Includes installation events (`INSTALL`, `UNINSTALL`)
- Signature verification required

---

## How We Handle the Data

### 1. Webhook Reception

**Marketplace webhook endpoint**:
1. Receive HTTP POST request
2. Verify webhook signature (`x-ghl-signature` header)
3. Log raw payload to console
4. Parse JSON payload
5. **Store in `WebhookEvent` table** (audit trail)
6. Extract event type and data
7. Route to appropriate handler

### 2. Event Processing

**Appointment Events**:
- `appointment.created` → `handleAppointmentCreated()`
- `appointment.updated` → `handleAppointmentUpdated()`
- `appointment.cancelled` → `handleAppointmentCancelled()`
- `appointment.rescheduled` → `handleAppointmentRescheduled()`

**What happens**:
1. Extract appointment data (ID, time, status, calendar, contact, etc.)
2. Find or create Contact record
3. Find or create Appointment record
4. Link to Calendar (for attribution)
5. Assign closer/setter (if GHL user mapping exists)
6. Resolve attribution (based on company's attribution strategy)
7. Update appointment status

### 3. Data Storage

**All webhook data is stored in `WebhookEvent` table**:
- `processor`: `'ghl_marketplace'` (OAuth only)
- `eventType`: `'appointment.created'`, `'INSTALL'`, etc.
- `payload`: Full JSON payload (for debugging)
- `processed`: `true`/`false` (whether we successfully handled it)
- `processedAt`: Timestamp when processing completed
- `error`: Error message if processing failed
- `companyId`: Which company this webhook belongs to

---

## Viewing Webhook Data (Audit Trail)

### Option 1: Database Query

You can query the `WebhookEvent` table directly:

```sql
-- All webhooks from last 24 hours
SELECT * FROM "WebhookEvent" 
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC;

-- Failed webhooks
SELECT * FROM "WebhookEvent" 
WHERE "error" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 50;

-- Webhooks for specific company
SELECT * FROM "WebhookEvent" 
WHERE "companyId" = 'your-company-id'
ORDER BY "createdAt" DESC;
```

### Option 2: Super Admin Monitoring Page

Visit `/super-admin/monitoring` to see:
- Webhook statistics (total, processed, failed)
- Recent webhook events
- Error logs
- Breakdown by processor

### Option 3: API Endpoint

Use `/api/super-admin/overview` to get:
- Recent activity (last 10 webhook events)
- Error logs (last 20 errors)
- Webhook health metrics

---

## What Data You'll See

### Marketplace Webhooks

**Installation Event** (`INSTALL`):
```json
{
  "type": "INSTALL",
  "appId": "...",
  "locationId": "...",
  "companyId": "...",
  "userId": "...",
  "companyName": "...",
  "timestamp": "..."
}
```

**Appointment Created**:
```json
{
  "type": "appointment.created",
  "appointmentId": "...",
  "locationId": "...",
  "appointment": {
    "id": "...",
    "startTime": "...",
    "endTime": "...",
    "status": "scheduled",
    "calendarId": "...",
    "contactId": "...",
    "assignedUserId": "..."
  }
}
```

---

## Webhook Details

| Feature | OAuth (Marketplace) |
|---------|---------------------|
| **Webhook URL** | `/api/webhooks/ghl/marketplace` |
| **Authentication** | Signature verification (`x-ghl-signature`) |
| **Event Types** | Structured (`appointment.created`, `appointment.updated`) |
| **Payload Structure** | Consistent Marketplace format |
| **Installation Events** | Yes (`INSTALL`, `UNINSTALL`) |
| **Location ID** | Always included |
| **Company ID** | Included in payload |
| **Error Handling** | Structured error responses |

---

## How to Debug Issues

### 1. Check WebhookEvent Table

Query recent webhooks:
```sql
SELECT 
  id,
  processor,
  "eventType",
  processed,
  error,
  "createdAt",
  "processedAt"
FROM "WebhookEvent"
WHERE "createdAt" > NOW() - INTERVAL '12 hours'
ORDER BY "createdAt" DESC;
```

### 2. View Full Payload

Get the full webhook payload:
```sql
SELECT payload
FROM "WebhookEvent"
WHERE id = 'webhook-event-id';
```

### 3. Check Processing Errors

Find webhooks that failed:
```sql
SELECT 
  id,
  processor,
  "eventType",
  error,
  payload,
  "createdAt"
FROM "WebhookEvent"
WHERE error IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 20;
```

### 4. Server Logs

Check your server logs for:
- `[GHL Webhook]` - Regular webhook processing
- `[GHL Marketplace Webhook]` - Marketplace webhook processing
- `[GHL OAuth]` - OAuth-related events

---

## Data Flow Diagram

```
OAuth Flow:
GHL Marketplace → Webhook → /api/webhooks/ghl/marketplace
  → Verify Signature
  → Store in WebhookEvent
  → Extract locationId
  → Find Company by locationId
  → Route to Handler
  → Create/Update Appointment
  → Mark WebhookEvent as processed

API Key Flow:
GHL Workflow → Webhook → /api/webhooks/ghl
  → Store in WebhookEvent
  → Extract companyId (from webhook secret or payload)
  → Route to Handler
  → Create/Update Appointment
  → Mark WebhookEvent as processed
```

---

## Best Practices

1. **Always check WebhookEvent table first** - It has the full audit trail
2. **Look for `error` field** - Shows what went wrong
3. **Check `processed` field** - `false` means it wasn't handled
4. **Compare `createdAt` vs `processedAt`** - See processing time
5. **Filter by `processor`** - Distinguish OAuth vs API key webhooks
6. **Check server logs** - Detailed debugging information

---

## Future: Webhook Events Viewer UI

We should create a UI page at `/admin/integrations/webhooks` to:
- View recent webhook events
- Filter by processor, event type, status
- View full payloads
- See processing errors
- Retry failed webhooks

This would make debugging much easier without needing SQL queries.


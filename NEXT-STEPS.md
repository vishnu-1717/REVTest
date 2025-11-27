# Next Steps - Integration Implementation

## ✅ Implementation Complete

All code has been implemented. Here are the steps to complete the setup:

## 1. Install Dependencies

```bash
npm install openai
```

## 2. Run Database Migration

```bash
npx prisma migrate dev --name add_all_integrations
```

This will create a migration for:
- GHL OAuth fields (ghlOAuthAccessToken, ghlOAuthRefreshToken, etc.)
- Zoom integration fields (zoomAccountId, zoomClientId, etc.)
- Appointment Zoom fields (zoomMeetingId, zoomMeetingUuid, zoomTranscript)
- PCNChangelog model
- AIQuery model

## 3. Generate Prisma Client

```bash
npx prisma generate
```

## 4. Environment Variables

Add these to your `.env.local` or environment:

```bash
# Database (Required)
DATABASE_URL=postgresql://user:password@host:port/database
DIRECT_URL=postgresql://user:password@host:port/database

# Clerk Authentication (Required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# OpenAI (Required for AI features)
OPENAI_API_KEY=sk-...

# Encryption Key (Required for OAuth token encryption)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your-32-byte-hex-string-here

# GHL Marketplace OAuth
GHL_MARKETPLACE_CLIENT_ID=your-client-id
GHL_MARKETPLACE_CLIENT_SECRET=your-client-secret
GHL_OAUTH_REDIRECT_URI=https://yourdomain.com/api/integrations/ghl/oauth/callback
GHL_MARKETPLACE_WEBHOOK_SECRET=your-webhook-secret

# Zoom (Optional - for webhook signature verification)
ZOOM_WEBHOOK_SECRET=your-zoom-webhook-secret

# Cron (Optional - for securing cron endpoints)
CRON_SECRET=your-cron-secret

# Slack (if using Slack integration)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=your-slack-signing-secret

# Super Admin Emails (comma-separated, optional)
SUPER_ADMIN_EMAILS=admin@example.com,admin2@example.com

# Default Company Email (optional)
DEFAULT_COMPANY_EMAIL=default@example.com
```

## 5. Slack App Configuration

### Events API Setup (For @revphlo Mentions)

1. **Enable Events API** in your Slack app settings
   - Request URL: `https://yourdomain.com/api/slack/events`
   - Enable "Subscribe to bot events"
   - Add event: `app_mentions` (when users mention your bot)

2. **Bot Token Scopes** (required):
   - `app_mentions:read` - To receive mention events
   - `chat:write` - To send responses
   - `chat:write.public` - To post in channels (if needed)

### Interactions Setup

- Request URL: `https://yourdomain.com/api/slack/interactions`
- Enable Interactivity in your Slack app settings

### Optional: Slash Commands (Alternative to Mentions)

If you want to keep slash commands as well, configure:

1. **`/ask-sales`**
   - Request URL: `https://yourdomain.com/api/slack/commands/ask-sales`
   - Short description: "Ask questions about your sales data"
   - Usage hint: "What's my close rate this month?"

2. **`/insights`**
   - Request URL: `https://yourdomain.com/api/slack/commands/insights`
   - Short description: "Get sales insights and KPIs"
   - Usage hint: "7" (number of days)

**Note**: The bot now works via mentions (`@revphlo`) by default. Slash commands are optional.

## 6. Vercel Cron (Optional - for weekly reports)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-slack-report",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

Or configure in Vercel dashboard:
- Path: `/api/cron/weekly-slack-report`
- Schedule: `0 9 * * 1` (Every Monday at 9 AM)

## 7. GHL Marketplace App Configuration

1. **OAuth Redirect URI**: Add to GHL Marketplace app settings
   - `https://yourdomain.com/api/integrations/ghl/oauth/callback`

2. **Webhook URL**: Add to GHL Marketplace app settings
   - `https://yourdomain.com/api/webhooks/ghl/marketplace`

3. **Webhook Events**: Enable:
   - `appointmentCreate`
   - `appointmentUpdate`
   - `appointmentCancel`
   - `contactCreate`
   - `contactUpdate`

## 8. Zoom App Configuration

1. **Webhook URL**: Add to Zoom app settings
   - `https://yourdomain.com/api/webhooks/zoom`

2. **Webhook Events**: Enable:
   - `recording.completed`

3. **Webhook Secret**: Set in Zoom app settings and add to `ZOOM_WEBHOOK_SECRET` env var

## 9. Generate Embeddings (Optional - for semantic search)

After appointments are created, generate embeddings:

```typescript
// Can be done via API endpoint or script
import { backfillEmbeddings } from '@/lib/embeddings'

await backfillEmbeddings(companyId)
```

## 10. Test the Integration

1. **GHL OAuth**: Go to `/admin/integrations/ghl/setup` and click "Connect GHL Account"
2. **Zoom Setup**: Go to `/admin/integrations/zoom/setup` and enter credentials
3. **AI Chat**: Go to `/ai-chat` and test queries
4. **Slack Commands**: Test `/ask-sales` and `/insights` in Slack
5. **PCN QA**: Go to `/admin/pcn-qa` to review AI-generated PCNs

## Files Created/Modified

### New Files:
- `lib/ghl-oauth.ts` - GHL OAuth token management
- `lib/zoom-api.ts` - Zoom API client
- `lib/openai-client.ts` - OpenAI transcript analysis
- `lib/zoom-transcript-analyzer.ts` - Transcript analysis service
- `lib/zoom-show-rate.ts` - Show rate automation
- `lib/pcn-changelog.ts` - PCN changelog service
- `lib/ai-query-engine.ts` - AI query processing
- `lib/embeddings.ts` - Embeddings generation
- `lib/slack-bot-company-resolver.ts` - Company resolver
- `lib/slack-weekly-report.ts` - Weekly report generator
- `lib/ai-context.ts` - Company context builder
- `app/api/integrations/ghl/oauth/initiate/route.ts` - OAuth initiation
- `app/api/integrations/ghl/oauth/callback/route.ts` - OAuth callback
- `app/api/webhooks/ghl/marketplace/route.ts` - Marketplace webhook
- `app/api/webhooks/zoom/route.ts` - Zoom webhook
- `app/api/admin/integrations/zoom/route.ts` - Zoom admin API
- `app/api/admin/integrations/zoom/test/route.ts` - Zoom test API
- `app/api/admin/pcn-qa/route.ts` - PCN QA API
- `app/api/admin/pcn-qa/approve/route.ts` - PCN approve API
- `app/api/admin/pcn-qa/reject/route.ts` - PCN reject API
- `app/api/slack/interactions/route.ts` - Slack interactions
- `app/api/slack/commands/ask-sales/route.ts` - Ask sales command
- `app/api/slack/commands/insights/route.ts` - Insights command
- `app/api/cron/weekly-slack-report/route.ts` - Weekly report cron
- `app/api/ai/chat/route.ts` - AI chat API
- `app/(dashboard)/admin/integrations/zoom/setup/page.tsx` - Zoom setup UI
- `app/(dashboard)/admin/pcn-qa/page.tsx` - PCN QA dashboard
- `app/(dashboard)/ai-chat/page.tsx` - AI chat page
- `components/AIChat.tsx` - AI chat component

### Modified Files:
- `prisma/schema.prisma` - Added all new models and fields
- `lib/ghl-api.ts` - Updated to support OAuth
- `lib/slack-client.ts` - Enhanced with AI-generated PCN support
- `lib/pcn-submission.ts` - Integrated changelog logging
- `app/(dashboard)/admin/integrations/ghl/setup/page.tsx` - Updated for OAuth
- `app/api/admin/integrations/ghl/route.ts` - Added OAuth status
- `app/api/admin/integrations/ghl/disconnect/route.ts` - New disconnect endpoint

## Testing Checklist

- [ ] GHL OAuth connection works
- [ ] GHL appointments sync via marketplace webhook
- [ ] Zoom credentials can be saved and tested
- [ ] Zoom webhook receives recording.completed events
- [ ] Show rate updates automatically from Zoom
- [ ] AI transcript analysis generates PCNs
- [ ] AI-generated PCNs appear in Slack
- [ ] Slack buttons (Review & Edit, Approve & Submit) work
- [ ] PCN QA dashboard shows pending PCNs
- [ ] Changelog tracks all PCN changes
- [ ] AI chat interface works
- [ ] Slack `/ask-sales` command works
- [ ] Slack `/insights` command works
- [ ] Weekly reports send to Slack

## Notes

- All OAuth tokens are encrypted using AES-256-GCM
- All queries are filtered by `companyId` for multi-tenancy security
- Slack commands resolve company from `team_id` → `companyId`
- Embeddings are generated on-demand and can be backfilled
- PCN changelog tracks all changes for QA purposes


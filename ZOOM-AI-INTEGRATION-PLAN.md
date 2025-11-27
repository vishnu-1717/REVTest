# Zoom AI Call Analysis Integration Plan

## Overview
This document outlines how to implement the Zoom AI Call Analysis workflow directly into the platform, replacing the n8n workflow with native Next.js API routes and services.

## Architecture

### Components Needed

1. **Database Schema Updates** - Store Zoom credentials
2. **Zoom API Client** - Similar to `GHLClient` for Zoom API interactions
3. **OpenAI Integration** - For transcript analysis
4. **Webhook Endpoint** - Receive Zoom recording completion events
5. **Transcript Analysis Service** - Process transcripts and generate PCN
6. **Admin UI** - Configure Zoom integration (similar to GHL setup)

---

## Implementation Steps

### 1. Database Schema Updates

Add Zoom integration fields to the `Company` model in `prisma/schema.prisma`:

```prisma
model Company {
  // ... existing fields ...
  
  // Zoom Integration
  zoomAccountId        String?  // Account ID for OAuth
  zoomClientId         String?  // OAuth Client ID
  zoomClientSecret     String?  // OAuth Client Secret (encrypted)
  zoomAccessToken      String?  // Current access token (temporary)
  zoomRefreshToken     String?  // Refresh token for token rotation
  zoomTokenExpiresAt   DateTime? // Token expiration time
  zoomConnectedAt      DateTime?
  zoomWebhookSecret    String?  // For webhook verification
  zoomAutoSubmitPCN    Boolean  @default(false) // Auto-submit PCN from AI analysis
}
```

**Migration Command:**
```bash
npx prisma migrate dev --name add_zoom_integration
```

---

### 2. Zoom API Client

Create `lib/zoom-api.ts` similar to `lib/ghl-api.ts`:

**Key Features:**
- OAuth token management (get/refresh tokens)
- Get meeting recordings
- Download transcript files
- Validate credentials

**Structure:**
```typescript
export class ZoomClient {
  private accountId: string
  private clientId: string
  private clientSecret: string
  private accessToken?: string
  private refreshToken?: string
  private tokenExpiresAt?: Date
  
  constructor(accountId: string, clientId: string, clientSecret: string)
  
  // Get OAuth token using account credentials grant
  async getAccessToken(): Promise<string>
  
  // Refresh access token
  async refreshAccessToken(): Promise<string>
  
  // Get recordings for a meeting
  async getMeetingRecordings(meetingId: string): Promise<ZoomRecording[]>
  
  // Download transcript file
  async downloadTranscript(downloadUrl: string): Promise<string>
  
  // Validate credentials
  async validateCredentials(): Promise<boolean>
}
```

---

### 3. OpenAI Integration

Create `lib/openai-client.ts`:

**Key Features:**
- Analyze transcript using GPT
- Generate structured PCN JSON
- Use the same prompt from the n8n workflow

**Structure:**
```typescript
import OpenAI from 'openai'

export class OpenAIClient {
  private client: OpenAI
  
  constructor(apiKey: string)
  
  // Analyze transcript and generate PCN
  async analyzeCallTranscript(transcript: string): Promise<PCNSubmission>
}
```

**Note:** You'll need to add `openai` package:
```bash
npm install openai
```

---

### 4. Webhook Endpoint

Create `app/api/webhooks/zoom/route.ts`:

**Key Features:**
- Verify webhook signature (Zoom sends `x-zm-signature` header)
- Handle `recording.completed` events
- Extract meeting ID from payload
- Trigger transcript analysis workflow

**Structure:**
```typescript
export async function POST(request: NextRequest) {
  // 1. Verify webhook signature
  // 2. Parse webhook payload
  // 3. Find company by Zoom account ID
  // 4. Get meeting recordings
  // 5. Download transcript
  // 6. Analyze with OpenAI
  // 7. Submit PCN automatically (if enabled)
  // 8. Log webhook event
}
```

**Webhook Verification:**
Zoom uses HMAC-SHA256 signature. You'll need to:
- Get `x-zm-signature` header
- Get `x-zm-request-timestamp` header
- Compute HMAC of `timestamp + request body`
- Compare with signature

---

### 5. Transcript Analysis Service

Create `lib/zoom-transcript-analyzer.ts`:

**Key Features:**
- Match Zoom meeting to Appointment (by meeting ID, contact email, or scheduled time)
- Analyze transcript with OpenAI
- Parse AI response into PCNSubmission format
- Submit PCN automatically

**Structure:**
```typescript
export async function analyzeZoomRecording(
  meetingId: string,
  companyId: string,
  transcript: string
): Promise<{ success: boolean; pcnSubmitted?: boolean; appointmentId?: string }> {
  // 1. Find matching appointment
  // 2. Call OpenAI to analyze transcript
  // 3. Parse AI response
  // 4. Validate PCN submission
  // 5. Submit PCN (if auto-submit enabled)
  // 6. Return result
}
```

**Appointment Matching Strategy:**
- Try to match by Zoom meeting ID stored in appointment `customFields`
- Fall back to matching by contact email + scheduled time window
- Fall back to matching by closer email + scheduled time window

---

### 6. Admin UI for Zoom Setup

Create `app/(dashboard)/admin/integrations/zoom/setup/page.tsx`:

**Similar to GHL setup page, include:**
- Account ID input
- Client ID input
- Client Secret input
- Test connection button
- Enable/disable auto-submit PCN toggle
- Webhook URL display (for Zoom marketplace configuration)

**API Route:** `app/api/admin/integrations/zoom/route.ts`
- POST: Save Zoom credentials
- GET: Get current Zoom setup status

---

### 7. Store Meeting ID in Appointments

Update appointment creation/update to store Zoom meeting ID:

**Option 1:** Add to `customFields` JSON
```typescript
customFields: {
  zoomMeetingId: "87857711514",
  zoomMeetingUuid: "14oJEuPmR0+IkK87cpPJKw=="
}
```

**Option 2:** Add dedicated fields to schema (if needed frequently)
```prisma
model Appointment {
  // ... existing fields ...
  zoomMeetingId  String?
  zoomMeetingUuid String?
}
```

---

## Implementation Order

### Phase 1: Foundation
1. ✅ Update database schema
2. ✅ Create Zoom API client
3. ✅ Create OpenAI client
4. ✅ Create admin UI for Zoom setup

### Phase 2: Webhook & Processing
5. ✅ Create webhook endpoint
6. ✅ Implement webhook signature verification
7. ✅ Create transcript analyzer service
8. ✅ Implement appointment matching logic

### Phase 3: Auto-Submission
9. ✅ Add auto-submit PCN option
10. ✅ Implement automatic PCN submission
11. ✅ Add error handling and logging
12. ✅ Add Slack notifications for AI-generated PCNs

---

## File Structure

```
lib/
  zoom-api.ts                    # Zoom API client
  openai-client.ts               # OpenAI client
  zoom-transcript-analyzer.ts    # Transcript analysis service

app/api/
  webhooks/
    zoom/
      route.ts                   # Webhook endpoint
  admin/
    integrations/
      zoom/
        route.ts                 # Save/get Zoom config

app/(dashboard)/admin/integrations/
  zoom/
    setup/
      page.tsx                   # Admin UI for Zoom setup
```

---

## Environment Variables

Add to `.env`:
```bash
# OpenAI (if not already present)
OPENAI_API_KEY=sk-...

# Zoom Webhook (optional, for signature verification)
ZOOM_WEBHOOK_SECRET=...
```

---

## Security Considerations

1. **Encrypt Zoom Credentials**: Store `zoomClientSecret` encrypted (similar to Slack secrets)
2. **Token Rotation**: Implement automatic token refresh for Zoom OAuth tokens
3. **Webhook Verification**: Always verify Zoom webhook signatures
4. **Rate Limiting**: Add rate limiting to webhook endpoint
5. **Error Handling**: Don't expose sensitive info in error messages

---

## Error Handling

**Webhook Processing:**
- Log all webhook events to `WebhookEvent` table
- Retry failed transcript downloads
- Handle missing transcripts gracefully
- Notify admins of persistent failures

**AI Analysis:**
- Handle malformed AI responses
- Fall back to manual PCN if AI fails
- Log analysis errors for review
- Store raw AI response for debugging

---

## Testing Strategy

1. **Unit Tests:**
   - Zoom API client methods
   - OpenAI prompt formatting
   - PCN parsing logic

2. **Integration Tests:**
   - Webhook signature verification
   - End-to-end: webhook → transcript → PCN submission
   - Appointment matching logic

3. **Manual Testing:**
   - Create test Zoom meeting
   - Trigger webhook manually
   - Verify PCN auto-submission
   - Test error scenarios

---

## Migration from n8n

**Steps:**
1. Export existing n8n workflow configuration (for reference)
2. Set up Zoom integration in platform
3. Configure webhook URL in Zoom marketplace
4. Test with a few recordings
5. Disable n8n workflow once verified
6. Monitor for any issues

---

## Future Enhancements

1. **Manual Trigger**: Allow admins to manually trigger analysis for past recordings
2. **Review Before Submit**: Option to review AI-generated PCN before auto-submission
3. **Confidence Scoring**: Show confidence level for AI analysis
4. **Transcript Storage**: Store transcripts in database for review
5. **Multi-Language Support**: Handle non-English transcripts
6. **Custom Prompts**: Allow companies to customize AI analysis prompts

---

## Cost Considerations

**OpenAI API Costs:**
- GPT-4/5 API calls per transcript analysis
- Estimate: ~$0.01-0.10 per call (depending on transcript length)
- Consider caching for duplicate analyses

**Zoom API:**
- No additional cost (uses existing Zoom account)

---

## Dependencies to Add

```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "crypto": "^1.0.1"  // For webhook signature verification (built-in Node.js)
  }
}
```

---

## Questions to Resolve

1. **Appointment Matching**: How to reliably match Zoom meetings to appointments?
   - Store Zoom meeting ID when creating appointment?
   - Match by contact email + time window?
   - Manual mapping interface?

2. **Auto-Submit vs Review**: Should AI-generated PCNs be auto-submitted or require review?
   - Default: Review required
   - Option: Auto-submit with confidence threshold

3. **Multiple Recordings**: Handle multiple recording files per meeting?
   - Use transcript file (TRANSCRIPT type)
   - Combine multiple transcripts if needed

4. **Token Management**: Where to store and refresh Zoom OAuth tokens?
   - Database (current approach)
   - Redis cache (for performance)
   - Background job for token refresh

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (Foundation)
3. Test Zoom API integration
4. Implement webhook endpoint
5. Add OpenAI integration
6. Test end-to-end flow
7. Deploy to production


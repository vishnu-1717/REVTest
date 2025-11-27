# Local Testing Guide

## ✅ What Can Be Tested Locally (Right Now)

### 1. **AI Chat Interface**
- **URL**: `http://localhost:3000/ai-chat`
- **What to test**: 
  - Ask questions about sales data
  - Test natural language queries
  - Verify AI responses are contextual to your company

### 2. **PCN QA Dashboard**
- **URL**: `http://localhost:3000/admin/pcn-qa`
- **What to test**:
  - View pending AI-generated PCNs
  - Approve/reject PCNs
  - Review changelog entries

### 3. **GHL Integration Setup Page**
- **URL**: `http://localhost:3000/admin/integrations/ghl/setup`
- **What to test**:
  - View OAuth connection status
  - See if GHL credentials are configured
  - Test disconnect functionality
- **Note**: OAuth flow requires production URL, but you can verify the UI works

### 4. **Zoom Integration Setup**
- **URL**: `http://localhost:3000/admin/integrations/zoom/setup`
- **What to test**:
  - Enter Zoom credentials
  - Test Zoom API connection
  - Save credentials

### 5. **Generate Embeddings** (if you have appointment data)
- Can be done via API or script
- Needed for semantic search in AI chat

## 🚀 What Needs Production URL

### 1. **Slack App Configuration**
- **Blocked until**: App is deployed to production
- **What to configure**:
  - Events API URL: `https://yourdomain.com/api/slack/events`
  - Interactions URL: `https://yourdomain.com/api/slack/interactions`
  - Slash commands: `/ask-sales`, `/insights`

### 2. **GHL OAuth Callback**
- **Blocked until**: App is deployed to production
- **Callback URL**: `https://yourdomain.com/api/integrations/ghl/oauth/callback`
- **Note**: GHL Marketplace app must have this URL configured

### 3. **Zoom Webhooks**
- **Blocked until**: App is deployed to production
- **Webhook URL**: `https://yourdomain.com/api/webhooks/zoom`

## 📋 Recommended Next Steps

### Step 1: Start Dev Server & Test Locally
```bash
npm run dev
```

Then test:
1. ✅ AI Chat at `/ai-chat`
2. ✅ PCN QA at `/admin/pcn-qa`
3. ✅ GHL Setup at `/admin/integrations/ghl/setup`
4. ✅ Zoom Setup at `/admin/integrations/zoom/setup`

### Step 2: Generate Embeddings (Optional)
If you have appointment data, generate embeddings for better AI search:
```typescript
// Can be done via API endpoint or script
import { backfillEmbeddings } from '@/lib/embeddings'
await backfillEmbeddings(companyId)
```

### Step 3: Prepare for Deployment
1. **Deploy to Vercel** (if not already deployed)
2. **Update GHL Marketplace** with production callback URL
3. **Configure Slack App** with production webhook URLs
4. **Configure Zoom** with production webhook URL

### Step 4: Post-Deployment Testing
After deployment, test:
- GHL OAuth flow (connect account)
- Slack commands and mentions
- Zoom webhook receiving recordings
- AI-generated PCNs appearing in Slack

## 🧪 Quick Test Commands

### Test AI Chat API
```bash
# In browser console (after signing in)
fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'What is my close rate?' })
})
  .then(res => res.json())
  .then(console.log)
```

### Test PCN QA API
```bash
# In browser console
fetch('/api/admin/pcn-qa')
  .then(res => res.json())
  .then(console.log)
```

### Test GHL Integration Status
```bash
# In browser console
fetch('/api/admin/integrations/ghl')
  .then(res => res.json())
  .then(console.log)
```

## 📝 Deployment Checklist

Before deploying, ensure:
- [x] All environment variables are set in Vercel
- [x] Database migration is complete
- [x] Prisma Client is generated
- [ ] GHL Marketplace app has production callback URL configured
- [ ] Ready to configure Slack after deployment
- [ ] Ready to configure Zoom after deployment

After deployment:
- [ ] Test GHL OAuth connection
- [ ] Configure Slack webhooks
- [ ] Configure Zoom webhooks
- [ ] Test end-to-end workflows


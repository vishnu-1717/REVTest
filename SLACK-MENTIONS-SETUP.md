# Slack Bot Mentions Setup

## Overview

The Slack bot has been configured to work via **mentions** (`@revphlo`) instead of (or in addition to) slash commands. Users can now simply mention the bot in any channel to ask questions about their sales data.

## How It Works

### User Experience

Instead of typing:
```
/ask-sales What's my close rate this month?
```

Users can now simply type:
```
@revphlo What's my close rate this month?
```

The bot will:
1. Receive the mention event
2. Extract the query (removing the bot mention)
3. Process it using the AI query engine
4. Reply in a thread to keep conversations organized

### Technical Implementation

**New Endpoint**: `/api/slack/events`
- Handles Slack Events API requests
- Processes `app_mention` events
- Verifies request signatures for security
- Responds within 3 seconds (Slack requirement)
- Processes queries asynchronously

**Key Features**:
- ✅ Thread-based replies (keeps conversations organized)
- ✅ Signature verification (security)
- ✅ Multi-tenant support (resolves company from team_id)
- ✅ Help message when no query provided
- ✅ Error handling with user-friendly messages

## Slack App Configuration

### 1. Enable Events API

In your Slack app settings (https://api.slack.com/apps):

1. Go to **"Event Subscriptions"**
2. Enable **"Enable Events"**
3. Set **Request URL**: `https://yourdomain.com/api/slack/events`
4. Slack will verify the URL (responds to `url_verification` challenge)

### 2. Subscribe to Bot Events

Under **"Subscribe to bot events"**, add:
- `app_mentions` - Required for mentions to work

### 3. Bot Token Scopes

Ensure your bot has these scopes:
- `app_mentions:read` - To receive mention events
- `chat:write` - To send responses
- `chat:write.public` - To post in channels (if needed)

### 4. Install/Reinstall App

After adding events, you may need to reinstall the app to your workspace:
1. Go to **"Install App"** or **"OAuth & Permissions"**
2. Click **"Reinstall to Workspace"**
3. Authorize the new scopes

## Testing

1. **Invite bot to a channel**:
   ```
   /invite @revphlo
   ```

2. **Mention the bot**:
   ```
   @revphlo What's my close rate this month?
   ```

3. **Check for response**:
   - Bot should reply in a thread
   - Response should contain the answer to your query

## Slash Commands (Optional)

The slash commands (`/ask-sales`, `/insights`) are still available if you want to keep them. They work alongside mentions - you can use either method.

To disable slash commands:
1. Remove them from Slack app settings
2. The mention-based system will continue to work

## Troubleshooting

### Bot doesn't respond to mentions

1. **Check Events API is enabled**:
   - Go to Slack app settings → Event Subscriptions
   - Verify "Enable Events" is ON
   - Verify Request URL is correct

2. **Check bot is in the channel**:
   - Bot must be invited to the channel
   - Use `/invite @revphlo` to add it

3. **Check bot token scopes**:
   - Verify `app_mentions:read` scope is added
   - Reinstall app if you just added the scope

4. **Check logs**:
   - Look for errors in your application logs
   - Check for signature verification failures

### Signature verification errors

- Ensure `slackSigningSecret` is set in your Company record
- Verify the secret matches what's in Slack app settings
- Check that the request URL is correct

### Bot responds but with errors

- Check that `OPENAI_API_KEY` is set
- Verify database connection is working
- Check that company has Slack properly connected

## Migration from Slash Commands

If you're migrating from slash commands to mentions:

1. **Set up Events API** (see above)
2. **Test mentions** in a test channel
3. **Optional**: Keep slash commands for backward compatibility
4. **Optional**: Remove slash commands once mentions are working

## Code Changes

### New Files
- `app/api/slack/events/route.ts` - Events API endpoint

### Modified Files
- `lib/slack-bot-company-resolver.ts` - Added `slackSigningSecret` to return value
- `NEXT-STEPS.md` - Updated with Events API setup instructions

### Unchanged
- `app/api/slack/commands/ask-sales/route.ts` - Still works if you want to keep it
- `app/api/slack/commands/insights/route.ts` - Still works if you want to keep it
- `lib/ai-query-engine.ts` - No changes needed
- All other Slack integration code - No changes needed

## Security

- ✅ Request signatures are verified using HMAC-SHA256
- ✅ Timestamp validation prevents replay attacks
- ✅ Company resolution ensures multi-tenant isolation
- ✅ All queries are scoped to the company's data

## Example Interactions

### Basic Query
```
User: @revphlo What's my close rate this month?
Bot: [In thread] Your close rate for this month is 45.2%...
```

### Insights Request
```
User: @revphlo Show me insights for the last 7 days
Bot: [In thread] 📊 Sales Insights (Last 7 days)...
```

### No Query Provided
```
User: @revphlo
Bot: [In thread] Hi! I'm Revphlo's AI assistant. Ask me questions about your sales data!
```


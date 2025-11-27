# Sales-Slack-Bot Integration Analysis

## What Sales-Slack-Bot Does

The **Sales-Slack-Bot-main** is a standalone Slack bot application that provides AI-powered sales analytics through Slack commands. Here's what it does:

### Core Features

1. **Slack Commands**:
   - `/ask-sales <question>` - Natural language questions about sales data (e.g., "who had the highest close rate last week?")
   - `/insights [days]` - KPI summary for the last N days (default 7)

2. **Interactive Mentions**:
   - Responds to @bot mentions in channels with answers to sales questions

3. **AI-Powered Analytics**:
   - **Semantic Search**: Uses OpenAI embeddings to find relevant call/appointment data based on natural language queries
   - **SQL Generation**: Converts natural language questions into SQL queries for custom data pulls
   - **Intent Classification**: Routes questions to metrics, semantic search, or SQL generation

4. **Weekly Reports**:
   - Automated cron job that sends weekly sales performance summaries to a default Slack channel every Monday at 9 AM

5. **Data Sources**:
   - Queries a `CallAnalytics` database view
   - Uses `CallAnalyticsEmbedding` table for vector similarity search
   - Requires fields like: `appointmentId`, `companyId`, `closerName`, `contactName`, `status`, `outcome`, `saleAmount`, `scheduledAt`, `leadSource`, `objectionType`, `objectionNotes`, `notes`, `semantic_text`

### Technical Stack

- **Runtime**: Node.js (ES modules)
- **Slack SDK**: `@slack/bolt` (Socket Mode)
- **Database**: PostgreSQL with pgvector extension for embeddings
- **AI**: OpenAI API (embeddings + chat completions)
- **Database Access**: Raw SQL queries using `pg` library
- **Cron**: `node-cron` for scheduled reports

---

## Integration Compatibility Assessment

### ❌ **CANNOT integrate directly** - Major architectural clashes

### 🔒 **CRITICAL: Multi-Tenancy Security**
The bot currently uses a hardcoded `COMPANY_ID` from environment variables, which **will not work** for your multi-tenant SaaS. You MUST:
1. Map Slack `team_id` (workspace ID) → Company via `slackWorkspaceId` field
2. Resolve `companyId` from each Slack event before processing
3. Verify ALL queries filter by `companyId` (bot code already does this ✅)
4. Reject requests if company not found or Slack not connected

**See "Multi-Tenancy Security & Company Isolation" section below for full details.**

## Clashes & Conflicts

### 1. **Different Slack Libraries** ⚠️
- **Bot uses**: `@slack/bolt` (v3.19.0) - Socket Mode for real-time events
- **Your codebase uses**: `@slack/web-api` (v7.12.0) - REST API only
- **Impact**: Cannot share the same Slack app configuration. Bolt requires Socket Mode tokens, your current setup uses OAuth tokens.

### 2. **Database Schema Status** ✅ (Partially Resolved)
- **Bot requires**: 
  - `CallAnalytics` view/table with specific columns
  - `CallAnalyticsEmbedding` table with pgvector support
- **Your database has**: 
  - ✅ `CallAnalytics` view/table (exists in Neon)
  - ✅ `CallAnalyticsEmbedding` table (exists in Neon)
  - ⚠️ Not in Prisma schema (can query with raw SQL)
- **Your codebase has**: 
  - `Appointment` model (Prisma)
  - `Sale` model (Prisma)

### 3. **Different Database Access Patterns** ⚠️
- **Bot uses**: Raw SQL with `pg` library
- **Your codebase uses**: Prisma ORM
- **Impact**: Would need to maintain two different database access methods

### 4. **Architecture Mismatch** ⚠️
- **Bot**: Standalone Node.js application with `index.js` entry point
- **Your codebase**: Next.js application with API routes
- **Impact**: Bot expects to run as a separate process, not as Next.js API routes

### 5. **Authentication Differences** ⚠️
- **Bot**: Uses environment variables (`COMPANY_ID`, `DATABASE_URL`)
- **Your codebase**: Uses Clerk for user auth, company context from session
- **Impact**: Need to map Clerk sessions to company IDs

### 6. **Missing Dependencies** ⚠️
- **Bot requires**: 
  - `@slack/bolt`
  - `pg` (PostgreSQL client)
  - `node-cron`
  - `openai`
  - pgvector extension in PostgreSQL
- **Your codebase has**: 
  - `@slack/web-api` (different library)
  - Prisma (different DB access)
  - No cron library
  - No OpenAI integration

---

## ✅ Important Update: Database Tables Already Exist

**Good news!** The `CallAnalytics` and `CallAnalyticsEmbedding` tables already exist in your Neon database. This significantly simplifies integration.

### What This Means:

1. **No need to create tables/views** - They're already there!
2. **Can use raw SQL queries** - Since they're not in Prisma schema, you'll query them directly with SQL (which the bot already does)
3. **Verify structure** - Just need to confirm the columns match what the bot expects
4. **Optional Prisma integration** - You can add `CallAnalyticsEmbedding` to Prisma schema for type safety, but it's not required

### How to Query Existing Tables:

Since these tables aren't in Prisma, you'll use raw SQL queries. The bot already does this with the `pg` library. In your Next.js app, you can:

**Option A**: Use Prisma's `$queryRaw` for raw SQL:
```typescript
const results = await prisma.$queryRaw`
  SELECT * FROM "CallAnalytics" 
  WHERE "companyId" = ${companyId}
  LIMIT 10
`
```

**Option B**: Use `pg` library directly (like the bot does):
```typescript
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const result = await pool.query('SELECT * FROM "CallAnalytics" WHERE "companyId" = $1', [companyId])
```

**Option C**: Add to Prisma schema (optional, for type safety):
- Add `CallAnalyticsEmbedding` model to schema
- Use `$queryRaw` for `CallAnalytics` view (Prisma can't model views directly)

---

## What Needs to Happen for Integration

### Option 1: Full Integration (Recommended)
Convert the bot functionality into Next.js API routes and integrate with your existing architecture.

#### Steps Required:

1. **Verify Database Tables** (✅ Already exist in Neon):
   - `CallAnalytics` view/table exists
   - `CallAnalyticsEmbedding` table exists
   - **Action**: Verify column structure matches bot expectations (see bot's `semanticSearch.js` for required fields)
   - **Optional**: Add to Prisma schema for type safety (or use raw SQL)

2. **Optional: Add to Prisma Schema** (Recommended for type safety):
   ```prisma
   // If CallAnalytics is a view, Prisma can't directly model it
   // Use raw SQL queries instead, or create a type definition
   
   // For CallAnalyticsEmbedding table:
   model CallAnalyticsEmbedding {
     appointmentId String   @id
     companyId     String
     semantic_text String?  @db.Text
     embedding    Unsupported("vector(3072)")? // pgvector type
     
     @@index([companyId])
     // Note: pgvector index should already exist if table was created properly
   }
   ```
   **Note**: If you prefer to keep using raw SQL (since Prisma doesn't fully support pgvector), you can skip adding to schema.

3. **Install Dependencies**:
   ```bash
   npm install @slack/bolt openai node-cron pg
   ```

5. **Create Slack Bot API Routes**:
   - Convert `slack.js` → Next.js API route handlers
   - Convert `semanticSearch.js` → Use Prisma + raw SQL for embeddings
   - Convert `analyticsQueries.js` → Use Prisma queries
   - Convert `cron.js` → Use Vercel Cron or separate worker

6. **Handle Multi-Company Context** (✅ Critical for Security):
   - ❌ Bot currently uses hardcoded `COMPANY_ID` from env - **MUST CHANGE**
   - ✅ Your codebase stores `slackWorkspaceId` in Company model
   - ✅ Extract `team_id` from Slack events (`command.team_id`, `event.team_id`)
   - ✅ Lookup Company: `WHERE slackWorkspaceId = team_id`
   - ✅ Use resolved `companyId` for ALL queries (already filtered in bot code)
   - ✅ Reject requests if company not found or Slack not connected

7. **Set Up Slack Socket Mode**:
   - Create new Slack app with Socket Mode enabled
   - Get `SLACK_APP_TOKEN` (xapp token)
   - Store per-company or use single bot for all companies

8. **Create Embedding Backfill Script**:
   - Adapt `backfillEmbeddings.js` to use Prisma
   - Run to generate embeddings for existing appointments

### Option 2: Run as Separate Service (Not Recommended)
Run the bot as a standalone Node.js service alongside your Next.js app.

**Issues**:
- Requires separate deployment
- Duplicate database connections
- Harder to maintain
- Doesn't leverage your existing infrastructure

### Option 3: Hybrid Approach
Keep bot as separate service but share database and Slack credentials.

**Issues**:
- Still requires separate deployment
- Complex credential management
- Two different codebases to maintain

---

## Recommended Integration Path

### Phase 1: Database Verification (✅ Simplified)
1. ✅ **Verify `CallAnalytics` structure** - Check that columns match bot expectations:
   - Required: `appointmentId`, `companyId`, `closerName`, `contactName`, `status`, `outcome`, `saleAmount`, `scheduledAt`, `leadSource`, `objectionType`, `objectionNotes`, `notes`, `semantic_text`, `appointmentCashCollected`, `cancellationReason`
2. ✅ **Verify `CallAnalyticsEmbedding` structure** - Check table has:
   - `appointmentId` (primary key), `companyId`, `semantic_text`, `embedding` (vector type)
   - pgvector index exists for similarity search
3. **Optional**: Add `CallAnalyticsEmbedding` to Prisma schema for type safety (or continue with raw SQL)
4. **Test queries**: Run sample queries from bot's `analyticsQueries.js` to verify data access

### Phase 2: Core Functionality
1. **Create company resolver** - Map Slack `team_id` → `companyId` via `slackWorkspaceId`
2. Create `/api/slack/commands` route for `/ask-sales` and `/insights`
   - **CRITICAL**: Resolve company from `team_id` before processing
   - Reject if company not found or Slack not connected
3. Create `/api/slack/events` route for app mentions
   - **CRITICAL**: Resolve company from `team_id` before processing
4. Port `semanticSearch.js` to use Prisma + raw SQL
   - ✅ Already filters by `companyId` - verify this works
5. Port `analyticsQueries.js` to use Prisma
   - ✅ Already filters by `companyId` - verify this works
6. Add OpenAI integration
7. **Security audit**: Verify ALL queries filter by `companyId`

### Phase 3: Embeddings
1. Create embedding generation utility
2. Create backfill script
3. Set up automatic embedding generation for new appointments

### Phase 4: Slack Integration
1. Set up Slack Socket Mode app
2. Configure webhook endpoints
3. Handle multi-company routing

### Phase 5: Cron Jobs
1. Set up Vercel Cron or separate worker
2. Port weekly report functionality

---

## Estimated Effort

- **Database verification**: 1-2 hours (✅ Much faster since tables exist!)
- **Core functionality port**: 8-12 hours
- **Embeddings integration**: 3-4 hours (Simplified - tables already exist)
- **Slack Socket Mode setup**: 2-3 hours
- **Testing & refinement**: 4-6 hours

**Total**: ~18-27 hours of development work (reduced from 20-30 hours)

---

## 🔒 Multi-Tenancy Security & Company Isolation

**CRITICAL**: This is a multi-tenant SaaS. Every query MUST be scoped to a specific company to prevent data leakage.

### Current Bot Issue
The bot uses a hardcoded `COMPANY_ID` from environment variables:
```javascript
const COMPANY_ID = process.env.COMPANY_ID; // ❌ Single company only
```

This won't work for multi-tenant - we need to **dynamically determine the company** from each Slack event.

### Solution: Map Slack Workspace to Company

Your database already has the mapping! The `Company` model stores:
- `slackWorkspaceId` - The Slack team/workspace ID
- `slackBotToken` - The bot token for that workspace

**How it works:**
1. When a Slack event comes in (command, mention, etc.), it includes `team_id` (workspace ID)
2. Look up the Company by `slackWorkspaceId = team_id`
3. Use that `companyId` for ALL queries
4. **Verify** that company has Slack connected before processing

### Implementation Pattern

```typescript
// In your Slack bot handler
async function getCompanyFromSlackEvent(event: SlackEvent): Promise<string | null> {
  const teamId = event.team_id || event.team?.id;
  if (!teamId) {
    return null;
  }
  
  const company = await prisma.company.findFirst({
    where: { slackWorkspaceId: teamId },
    select: { id: true, slackBotToken: true }
  });
  
  if (!company || !company.slackBotToken) {
    return null; // Company not connected or no bot token
  }
  
  return company.id;
}

// Use in all handlers
app.command("/ask-sales", async ({ command, ack, respond }) => {
  await ack();
  
  const companyId = await getCompanyFromSlackEvent(command);
  if (!companyId) {
    await respond("❌ This workspace is not connected to RevPhlo. Please connect Slack in your admin settings.");
    return;
  }
  
  // Now use companyId for all queries
  const answer = await answerQuestion(companyId, question);
  await respond(answer);
});
```

### Security Checklist

✅ **All queries MUST filter by companyId**:
- ✅ `semanticSearch()` - Already filters: `WHERE a."companyId" = $1`
- ✅ `getKpiSummary()` - Already filters: `WHERE "companyId" = $1`
- ✅ `getRepLeaderboard()` - Already filters: `WHERE "companyId" = $1`
- ✅ `getTopReasons()` - Already filters: `WHERE "companyId" = $1`
- ✅ SQL generation - Must inject `WHERE "companyId" = '{{companyId}}'`

✅ **Verify company has Slack connected**:
- Check `slackWorkspaceId` exists and matches
- Check `slackBotToken` exists
- Reject requests if company not found

✅ **Validate CallAnalytics data**:
- Ensure `CallAnalytics` view filters by `companyId`
- Ensure `CallAnalyticsEmbedding` table has `companyId` column
- Verify embeddings are scoped to company

### Database Verification

**Verify CallAnalytics view includes companyId filter:**
```sql
-- Check if CallAnalytics is a view or table
SELECT table_type 
FROM information_schema.tables 
WHERE table_name = 'CallAnalytics';

-- Verify companyId column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'CallAnalytics' AND column_name = 'companyId';

-- Test query with companyId filter
SELECT COUNT(*) 
FROM "CallAnalytics" 
WHERE "companyId" = 'test-company-id';
```

**Verify CallAnalyticsEmbedding has companyId:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'CallAnalyticsEmbedding' AND column_name = 'companyId';

-- Verify index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'CallAnalyticsEmbedding' AND indexdef LIKE '%companyId%';
```

### Multi-Company Bot Architecture

**Option A: Single Bot Instance (Recommended)**
- One Slack app/bot for all companies
- Route by `team_id` → `companyId` lookup
- Simpler deployment, single codebase

**Option B: Per-Company Bot Instances**
- Each company has their own Slack app
- More complex, but better isolation
- Not recommended unless required

### Updated Bot Code Pattern

```typescript
// lib/slack-bot-company-resolver.ts
export async function resolveCompanyFromSlackTeam(teamId: string): Promise<{
  companyId: string;
  companyName: string;
} | null> {
  const company = await prisma.company.findFirst({
    where: { 
      slackWorkspaceId: teamId,
      slackBotToken: { not: null } // Must have bot connected
    },
    select: { id: true, name: true }
  });
  
  return company ? { companyId: company.id, companyName: company.name } : null;
}

// In slack.js handlers
app.command("/ask-sales", async ({ command, ack, respond }) => {
  await ack();
  
  const teamId = command.team_id;
  const company = await resolveCompanyFromSlackTeam(teamId);
  
  if (!company) {
    await respond("❌ This workspace is not connected. Please connect Slack in your RevPhlo admin settings.");
    return;
  }
  
  // Now use company.companyId for all queries
  const answer = await answerQuestion(company.companyId, question);
  await respond(answer);
});
```

---

## Key Considerations

1. **Multi-tenancy**: ✅ **SOLVED** - Map Slack `team_id` to Company via `slackWorkspaceId`. All queries already filter by `companyId`.

2. **Data Mapping**: Your `Appointment` model has different field names than what the bot expects. Need careful mapping in the view.

3. **OpenAI Costs**: Embeddings and chat completions will incur API costs. Consider caching and rate limiting.

4. **Performance**: Vector similarity search can be slow on large datasets. Consider indexing strategy.

5. **Security**: Socket Mode requires `SLACK_APP_TOKEN`. Store securely and validate all requests.

---

## Conclusion

The Sales-Slack-Bot provides valuable functionality (AI-powered sales analytics via Slack), but **cannot be directly integrated** due to architectural differences. However, the **core concepts and logic can be ported** to your Next.js application with significant refactoring.

The main work involves:
- ✅ **Verifying existing database tables** (already exist in Neon - just need to verify structure)
- Porting the bot logic to Next.js API routes
- Adapting to your multi-tenant architecture
- Setting up Slack Socket Mode
- Integrating OpenAI embeddings

This is a **moderate integration project** that will require careful planning and testing. The fact that the database tables already exist significantly simplifies the integration!


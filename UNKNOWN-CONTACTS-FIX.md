# Unknown Contacts Fix - Implementation Summary

## Problem
911 "Unknown" contacts in the system, with 93 appointments needing PCNs. All contacts have GHL Contact IDs but are missing names, emails, and phones because webhooks didn't include this data.

## Solution Implemented

### 1. Backfill Script (Immediate Fix)
**File**: `scripts/backfill-unknown-contacts-from-ghl.ts`

This script:
- Finds all contacts with name "Unknown" that have `ghlContactId`
- Groups them by company
- Fetches contact data from GHL API for each contact
- Updates contact name, email, and phone from GHL data
- Provides detailed progress reporting and statistics

**To run:**
```bash
npx tsx scripts/backfill-unknown-contacts-from-ghl.ts
```

**What it does:**
- Processes all companies with "Unknown" contacts
- Creates GHL API client for each company (requires OAuth connection)
- Fetches contact data from GHL API using `ghlContactId`
- Updates contacts with fetched name, email, and phone
- Skips contacts that can't be found in GHL or don't have valid names
- Reports statistics by company

### 2. Webhook Handler Updates (Long-term Prevention)
**Files Updated:**
- `lib/webhooks/handlers/appointment-created.ts`
- `lib/webhooks/handlers/appointment-cancelled.ts`

**Changes:**
- When creating a contact with name "Unknown" but `ghlContactId` exists, the handler now:
  1. Attempts to fetch contact data from GHL API
  2. Uses the fetched name, email, and phone instead of "Unknown"
  3. Falls back to "Unknown" only if GHL API fetch fails

- When updating an existing "Unknown" contact:
  1. First tries webhook data
  2. If webhook doesn't have name, fetches from GHL API
  3. Updates contact with fetched data

**Result:** Future webhooks will automatically fetch contact data from GHL API when name is missing, preventing new "Unknown" contacts.

## How It Works

### Backfill Process
1. Script queries database for all "Unknown" contacts with `ghlContactId`
2. Groups contacts by company
3. For each company:
   - Creates GHL API client (requires OAuth connection)
   - For each contact:
     - Calls `ghlClient.getContact(ghlContactId)`
     - Extracts name, email, phone from GHL response
     - Updates contact in database
     - Adds 100ms delay between requests to avoid rate limiting

### Webhook Prevention
1. When webhook arrives with missing contact name:
   - Checks if `ghlContactId` exists
   - Creates GHL API client
   - Fetches contact from GHL API
   - Uses fetched data instead of "Unknown"
2. If GHL API fetch fails, falls back to "Unknown" (existing behavior)

## Expected Results

### After Running Backfill
- Most "Unknown" contacts should be updated with real names
- Contacts that don't exist in GHL or have no name will remain "Unknown" (skipped)
- Statistics will show:
  - How many were updated
  - How many were skipped (not found in GHL or no valid name)
  - How many had errors

### Going Forward
- New webhooks with missing contact names will automatically fetch from GHL API
- "Unknown" contacts should become rare
- Existing "Unknown" contacts will be updated when they receive new webhooks

## Notes

- **GHL OAuth Required**: Both the backfill script and webhook handlers require GHL OAuth to be connected for each company
- **Rate Limiting**: Backfill script includes 100ms delays between API calls to avoid rate limits
- **Error Handling**: Both implementations gracefully handle API failures and continue processing
- **Logging**: Detailed logging helps track what's happening and debug issues

## Monitoring

After running the backfill, you can verify results by running:
```bash
npx tsx scripts/analyze-unknown-pcn-contacts.ts
```

This will show:
- Remaining "Unknown" contacts
- Which ones still need attention
- Updated statistics


# Unknown Contacts Analysis

## Summary

**911 total "Unknown" contacts** in the system, with **93 appointments** that need PCNs.

## Root Cause

**100% of "Unknown" contacts have GHL Contact IDs** but are missing:
- Contact name (all are "Unknown")
- Email (0% have email)
- Phone (0% have phone)

### Why This Happens

When GHL webhooks create appointments, the contact is created with name "Unknown" when:
1. `webhook.contactName` is empty/null
2. `webhook.firstName` is empty/null  
3. `webhook.lastName` is empty/null

This happens in `lib/webhooks/handlers/appointment-created.ts` line 315:
```typescript
const fullName = webhook.contactName || `${firstName} ${lastName}`.trim() || 'Unknown'
```

The webhook payload is missing contact name information, but the contact exists in GHL (we have the `ghlContactId`).

## Current Behavior

1. Contact is created with name "Unknown" when webhook lacks name data
2. There's logic to update "Unknown" contacts if a later webhook has the name (lines 332-346)
3. However, if no subsequent webhook arrives with name data, the contact remains "Unknown" forever

## Solution

Since all "Unknown" contacts have `ghlContactId`, we can:

1. **Fetch contact data from GHL API** when creating a contact with "Unknown" name
2. **Backfill existing "Unknown" contacts** by fetching from GHL API using their `ghlContactId`

## Recommendations

### Immediate Fix (Backfill)
Create a script to:
- Find all contacts with name "Unknown" that have `ghlContactId`
- Fetch contact data from GHL API for each company
- Update contact name, email, and phone from GHL data

### Long-term Fix (Prevention)
Modify `lib/webhooks/handlers/appointment-created.ts` to:
- When creating a contact with "Unknown" name but `ghlContactId` exists
- Immediately fetch contact data from GHL API
- Use the fetched data instead of "Unknown"

## Statistics

- **Total "Unknown" contacts**: 911
- **With appointments**: 221
- **With PCNs submitted**: 0 (but 93 need PCNs)
- **With GHL Contact ID**: 911 (100%)
- **With email**: 0 (0%)
- **With phone**: 0 (0%)

## Next Steps

1. Create backfill script to fetch and update existing "Unknown" contacts
2. Update webhook handler to fetch from GHL API when name is missing
3. Monitor for new "Unknown" contacts after fix


# Preventing "Unknown" Calendars in Appointments

## Current Issue

925 appointments have `calendar = null` (which displays as "Unknown" in the UI) even though 763 of them have valid `calendarRelation` records. This is a data migration issue where the old `calendar` string field wasn't populated when the new `calendarRelation` was added.

## Root Causes

1. **Webhook handlers don't populate the old `calendar` field**
   - `appointment-created.ts` sets `calendarId` but not `calendar`
   - `appointment-cancelled.ts` sets `calendarId` but not `calendar`
   - The UI likely checks the old `calendar` field first, showing "Unknown" when it's null

2. **Calendars must be synced before appointments arrive**
   - If a calendar isn't synced from GHL, appointments from that calendar will be rejected
   - The webhook handler requires calendars to exist in the database

3. **Calendars must be approved**
   - Only calendars with `isCloserCalendar = true` will create appointments
   - Unapproved calendars cause appointments to be rejected

## Solutions

### 1. Fix Webhook Handlers (IMMEDIATE)

Update both webhook handlers to populate the old `calendar` field for backward compatibility:

**In `lib/webhooks/handlers/appointment-created.ts`:**
- When creating appointment: Add `calendar: calendar?.name || null`
- When updating appointment: Add `calendar: calendar?.name || null`

**In `lib/webhooks/handlers/appointment-cancelled.ts`:**
- When creating appointment: Add `calendar: calendar?.name || null`

### 2. Ensure Calendars Are Synced

**Process:**
1. Go to Admin > Integrations > GHL > Calendars
2. Click "Sync Calendars" to fetch all calendars from GHL
3. Verify all active calendars are synced

**When to sync:**
- After connecting GHL OAuth
- When new calendars are added in GHL
- Periodically to catch calendar name/ID changes

### 3. Approve Calendars for Closer Appointments

**Process:**
1. Go to Admin > Calendars
2. For each calendar that should create appointments:
   - Toggle "Is Closer Calendar" to ON
   - Optionally set traffic source and calendar type
   - Optionally set default closer

**Why this matters:**
- Only approved calendars (`isCloserCalendar = true`) will create appointments
- Unapproved calendars cause webhook handler to reject appointments
- This prevents test/development calendars from creating appointments

### 4. Backfill Existing Data (OPTIONAL)

Create a script to backfill the old `calendar` field from `calendarRelation.name` for existing appointments:

```typescript
// Update appointments where calendar is null but calendarRelation exists
await prisma.appointment.updateMany({
  where: {
    calendar: null,
    calendarRelation: { isNot: null }
  },
  data: {
    calendar: { $set: { calendarRelation: { name: true } } } // Pseudo-code
  }
})
```

## Prevention Checklist

- [ ] Update webhook handlers to set both `calendarId` and `calendar` fields
- [ ] Sync calendars from GHL after OAuth connection
- [ ] Approve all calendars that should create appointments
- [ ] Monitor webhook logs for calendar lookup failures
- [ ] Re-sync calendars if calendar IDs change in GHL
- [ ] Backfill existing appointments with null calendar field

## Monitoring

Watch for these log messages in webhook handlers:
- `⚠️ Calendar not found by ID` - Calendar needs to be synced
- `❌ Rejecting appointment: Calendar not found` - Calendar missing from database
- `❌ Rejecting appointment: Calendar is not approved` - Calendar needs approval
- `⚠️ WARNING: Calendar ID mismatch` - Calendar ID changed in GHL, needs re-sync

## Best Practices

1. **Always sync calendars after OAuth connection**
2. **Approve calendars before they're used** - Don't wait for appointments to arrive
3. **Re-sync calendars periodically** - GHL calendar IDs can change
4. **Monitor webhook logs** - Catch calendar issues early
5. **Use calendarRelation for new code** - But maintain backward compatibility with `calendar` field


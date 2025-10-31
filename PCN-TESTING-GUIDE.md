# PCN System Testing Guide

## Prerequisites

1. Make sure your dev server is running: `npm run dev`
2. Be logged in to the application
3. Have test appointment data in your database

## Testing the PCN System

### Option 1: Browser DevTools (Recommended)

#### Test 1: Get Pending PCNs
1. Open your browser DevTools (F12)
2. Go to the Console tab
3. Run this JavaScript:

```javascript
fetch('/api/appointments/pending-pcns')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error('Error:', err))
```

**Expected**: JSON object with `count` and `appointments` array

#### Test 2: Get Specific Appointment
1. First, get an appointment ID from the pending PCNs response or your database
2. In the Console, run:

```javascript
// Replace with actual appointment ID
const appointmentId = 'YOUR_APPOINTMENT_ID_HERE'

fetch(`/api/appointments/${appointmentId}`)
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error('Error:', err))
```

**Expected**: Full appointment JSON with all fields including PCN data

#### Test 3: Submit PCN
1. Use an appointment ID that doesn't have a PCN submitted yet
2. In the Console, run:

```javascript
const appointmentId = 'YOUR_APPOINTMENT_ID_HERE'

fetch(`/api/appointments/${appointmentId}/submit-pcn`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    callOutcome: 'signed',
    signedNotes: 'Great call! Customer was very engaged.',
    cashCollected: 5000
  })
})
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error('Error:', err))
```

**Expected**: `{"success": true, "appointment": {...}}`

### Option 2: Using cURL with Session Cookie

If you want to use cURL, you'll need to extract your session cookie from the browser:

1. **Extract Cookie**:
   - Open DevTools → Network tab
   - Make any request to your app
   - Find the request in Network tab
   - Copy the `Cookie` header value

2. **Create test script**:

```bash
# Save your cookie
COOKIE="__clerk_db_jwt=YOUR_COOKIE_VALUE_HERE"

# Test 1: Pending PCNs
curl http://localhost:3000/api/appointments/pending-pcns \
  -H "Cookie: $COOKIE" | jq

# Test 2: Get Appointment
curl http://localhost:3000/api/appointments/YOUR_APPOINTMENT_ID \
  -H "Cookie: $COOKIE" | jq

# Test 3: Submit PCN
curl -X POST http://localhost:3000/api/appointments/YOUR_APPOINTMENT_ID/submit-pcn \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{
    "callOutcome": "signed",
    "signedNotes": "Great call!",
    "cashCollected": 5000
  }' | jq
```

### Option 3: Postman / Thunder Client

1. **Setup**:
   - Import cookies from your browser session
   - OR create a new collection with auth header

2. **Requests**:
   - GET `/api/appointments/pending-pcns`
   - GET `/api/appointments/:id`
   - POST `/api/appointments/:id/submit-pcn` with JSON body

## Expected Results

### Pending PCNs Response
```json
{
  "count": 5,
  "appointments": [
    {
      "id": "clxxxxx",
      "scheduledAt": "2025-10-29T14:00:00.000Z",
      "contactName": "John Doe",
      "closerName": "Jane Smith",
      "status": "booked",
      "minutesSinceScheduled": 45,
      "urgencyLevel": "normal"
    }
  ]
}
```

### Get Appointment Response
- Full appointment object with all fields
- Includes: contact, closer, setter, calendar, sale data
- All PCN fields (pcnSubmitted, pcnSubmittedAt, etc.)
- ISO 8601 timestamps

### Submit PCN Response
```json
{
  "success": true,
  "appointment": {
    "id": "clxxxxx",
    "status": "signed",
    "outcome": "signed",
    "pcnSubmitted": true,
    "pcnSubmittedAt": "2025-10-29T15:30:00.000Z",
    "contactName": "John Doe",
    "closerName": "Jane Smith"
  }
}
```

## Testing Different Outcomes

### 1. Showed (with offer)
```json
{
  "callOutcome": "showed",
  "firstCallOrFollowUp": "first_call",
  "wasOfferMade": true,
  "whyDidntMoveForward": "Price objection",
  "followUpScheduled": true,
  "followUpDate": "2025-11-01T14:00:00.000Z",
  "nurtureType": "thinking_it_over",
  "notes": "Will call back Friday"
}
```

### 2. Showed (no offer)
```json
{
  "callOutcome": "showed",
  "firstCallOrFollowUp": "first_call",
  "wasOfferMade": false,
  "qualificationStatus": "disqualified",
  "disqualificationReason": "Not qualified (budget)"
}
```

### 3. No Show
```json
{
  "callOutcome": "no_show",
  "noShowCommunicative": true,
  "noShowCommunicativeNotes": "Called to reschedule for next week"
}
```

### 4. Cancelled
```json
{
  "callOutcome": "cancelled",
  "cancellationReason": "Prospect initiated",
  "cancellationNotes": "Changed mind about the service"
}
```

### 5. Signed
```json
{
  "callOutcome": "signed",
  "signedNotes": "Closed successfully!",
  "cashCollected": 10000
}
```

## Troubleshooting

### Error: "Unauthorized"
- Make sure you're logged in
- Your session may have expired - refresh the page
- Check that `Clerk` auth is configured correctly

### Error: "User not found"
- Your Clerk user needs to exist in the database
- Run database sync: `npx prisma db push`

### Error: "Appointment not found"
- Check that the appointment ID is correct
- Verify the appointment belongs to your company
- Reps can only see their own appointments

### No pending PCNs showing
- Appointments must be at least 10 minutes past scheduled time
- Appointments must have `pcnSubmitted: false`
- Appointments cannot be cancelled
- Check your database for test data

## Database Verification

To verify PCN data was saved correctly:

```sql
-- Check appointments with PCNs
SELECT 
  id, 
  scheduled_at, 
  status, 
  outcome,
  pcn_submitted, 
  pcn_submitted_at,
  first_call_or_follow_up,
  was_offer_made,
  cash_collected
FROM "Appointment"
WHERE pcn_submitted = true
ORDER BY pcn_submitted_at DESC
LIMIT 10;

-- Check pending PCNs
SELECT 
  id,
  scheduled_at,
  status,
  pcn_submitted,
  closer_id
FROM "Appointment"
WHERE pcn_submitted = false
  AND scheduled_at < NOW() - INTERVAL '10 minutes'
  AND status != 'cancelled'
ORDER BY scheduled_at DESC;

-- Check audit logs
SELECT 
  event_type,
  payload,
  processed_at
FROM "WebhookEvent"
WHERE event_type = 'pcn.submitted'
ORDER BY processed_at DESC
LIMIT 10;
```

## Next Steps

Once testing is complete:
1. Create UI components for PCN form
2. Add PCN dashboard/queue view
3. Add email/SMS reminders for overdue PCNs
4. Add notifications for managers when PCNs are submitted


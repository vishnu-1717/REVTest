# Revphlo Platform Overview
## How Data Flows Through the System

This document explains in plain English how the Revphlo platform works, focusing on three key areas:
1. **How we intake data** - Where information comes from
2. **How we store data** - Where and how information is saved
3. **How we present data** - How information is shown to users

---

## Part 1: How We Intake Data

The platform receives data from multiple sources. Here's how each one works:

### 1. GoHighLevel (GHL) Webhooks - Appointment Data

**What it is**: GoHighLevel is a calendar booking system. When someone books an appointment, GHL sends us a notification.

**How it works**:
1. A customer books an appointment in GHL
2. GHL sends a webhook (HTTP POST request) to our endpoint: `/api/webhooks/ghl`
3. Our system receives the webhook payload containing:
   - Appointment details (time, date, status)
   - Contact information (name, email, phone)
   - Calendar information (which calendar was used)
   - Custom fields (marketing source, tags, etc.)

**What we do with it**:
- **Create or update Contact**: If the contact doesn't exist, we create a new Contact record. If they exist, we update their information.
- **Create or update Appointment**: We create an Appointment record with:
  - Scheduled time
  - Contact linked to it
  - Calendar linked to it
  - Status (booked, showed, no_show, signed, cancelled)
  - Closer/Setter assignment (if we can match GHL users to our users)
- **Resolve Attribution**: We figure out where the lead came from (Facebook, Google, etc.) based on the company's attribution strategy
- **Store webhook event**: We save the raw webhook data in `WebhookEvent` table for debugging

**Key Points**:
- Webhooks are real-time - data flows in as events happen
- We handle multiple webhook formats (GHL sends data in different structures)
- We automatically assign closers/setters based on GHL user mapping
- Attribution is configurable per company (GHL fields, calendar names, tags, etc.)

### 2. Payment Processor Webhooks - Revenue Data

**What it is**: When a customer pays (via Whop, Stripe, etc.), the payment processor sends us a webhook.

**How it works**:
1. Customer completes payment
2. Payment processor (e.g., Whop) sends webhook to `/api/webhooks/whop?company=xxx&secret=xxx`
3. Webhook contains:
   - Payment amount
   - Customer email/name
   - Payment ID (unique identifier)
   - Optional: appointment ID (if payment came from a payment link)

**What we do with it**:
- **Create Sale record**: We create a `Sale` record with payment details
- **Match to Appointment**: We try to automatically match the payment to an appointment using:
  1. **Direct match** (100% confidence): If payment link had appointment ID
  2. **Email match** (90% confidence): Match customer email to Contact email
  3. **Phone match** (85% confidence): Match customer phone to Contact phone
  4. **Fuzzy name match** (70-95% confidence): Use Levenshtein distance to match names, plus amount and date proximity
- **Calculate Commission**: If we find a match with high confidence (≥70%), we:
  - Calculate commission based on rep's commission rate
  - Create a `Commission` record
  - Link the Sale to the Appointment
  - Update appointment status to "signed" if it was "showed"
- **Flag for Review**: If confidence is low (<70%), we create an `UnmatchedPayment` record for admin review

**Key Points**:
- Matching is intelligent - we use multiple strategies to find the right appointment
- Supports partial payments (payment plans) - commission is released proportionally
- Manual matching available for edge cases
- Auto-updates appointment status when payment matches

### 3. Clerk Webhooks - User Management

**What it is**: Clerk is our authentication system. When users sign up or are deleted, Clerk tells us.

**How it works**:
1. User signs up via Clerk
2. Clerk sends webhook to `/api/webhooks/clerk`
3. We verify the webhook signature (security)
4. We create or update the User record in our database

**What we do with it**:
- **Create User**: Link Clerk account to our User record
- **Set Role**: Determine if user is admin, rep, or super admin
- **Link to Company**: Associate user with their company

### 4. Manual Data Entry - PCN (Post-Call Notes)

**What it is**: After an appointment, reps submit Post-Call Notes with details about what happened.

**How it works**:
1. Rep opens appointment in dashboard
2. Clicks "Submit PCN" button
3. Fills out form with:
   - Call outcome (signed, showed, no_show, cancelled)
   - Qualification status
   - Objection type (if didn't close)
   - Notes
   - Cash collected (if signed)
4. Submits via `/api/appointments/[id]/submit-pcn`

**What we do with it**:
- **Update Appointment**: Save all PCN data to the Appointment record
- **Update Status**: Change appointment status based on outcome
- **Create Commission**: If status is "signed" and cash collected, create commission
- **Match Payments**: If appointment is signed, try to auto-match with pending payments
- **Track Submission**: Record who submitted and when
- **Create Changelog**: Save history of PCN changes in `PCNChangelog` table

**Key Points**:
- PCNs are required by 6PM Eastern on appointment day
- Missing PCNs are excluded from show rate calculations
- Admins can submit PCNs for any appointment
- Reps can only submit for their own appointments (where they're the closer)

### 5. Excel/CSV Import - Bulk Data

**What it is**: Companies can import historical data from Excel spreadsheets.

**How it works**:
1. Admin uploads Excel file via `/api/appointments/import`
2. System parses the file (using xlsx library)
3. For each row:
   - Creates Contact if needed
   - Creates Appointment with all data
   - Links closer/setter by email matching
   - Includes PCN data if provided

**What we do with it**:
- **Bulk Create**: Creates many records at once
- **Data Mapping**: Maps Excel columns to database fields
- **Date Conversion**: Converts Excel date serial numbers to proper dates
- **Validation**: Checks for required fields and data quality

### 6. Zoom Integration - Call Transcripts

**What it is**: If companies use Zoom for calls, we can receive transcripts.

**How it works**:
1. Zoom sends webhook when meeting ends
2. We receive transcript via `/api/webhooks/zoom`
3. We analyze transcript with AI to extract:
   - Call outcome
   - Objections
   - Qualification status
   - Key notes

**What we do with it**:
- **Store Transcript**: Save full transcript to Appointment
- **AI Analysis**: Use OpenAI to extract structured data
- **Auto-Submit PCN**: If enabled, automatically create PCN from transcript
- **Link to Appointment**: Match Zoom meeting to appointment by time/contact

---

## Part 2: How We Store Data

All data is stored in a PostgreSQL database (hosted on Supabase). We use Prisma as our database toolkit, which gives us type-safe database access.

### Database Structure

The database is organized around the concept of **multi-tenancy** - each company's data is completely isolated. Every record belongs to a `Company`, and we filter all queries by `companyId`.

### Core Data Models

#### Company (The Root)
**Purpose**: Every other record belongs to a Company. This is how we isolate data.

**Stores**:
- Company name, email
- Integration credentials (GHL API keys, Zoom tokens, Slack tokens)
- Configuration (attribution strategy, timezone, PCN settings)
- Integration status (when connected, when disconnected)

**Key Relationships**:
- Has many Users
- Has many Appointments
- Has many Sales
- Has many Commissions
- Has many Contacts
- Has many Calendars

#### User (People in the System)
**Purpose**: Represents all people - reps, closers, setters, admins.

**Stores**:
- Name, email, role
- Clerk ID (for authentication)
- GHL User ID (for auto-assignment)
- Commission rate (custom or from role)
- Permissions (can view team metrics, etc.)

**Key Relationships**:
- Belongs to Company
- Can be closer on Appointments
- Can be setter on Appointments
- Has many Commissions
- Can submit PCNs

#### Contact (Customers/Prospects)
**Purpose**: The people who book appointments - your customers.

**Stores**:
- Name, email, phone
- GHL Contact ID (for syncing)
- Custom fields (JSON - flexible storage for GHL data)
- Tags (array of strings - for attribution)

**Key Relationships**:
- Belongs to Company
- Has many Appointments
- Has many Sales

#### Appointment (Sales Calls)
**Purpose**: The center of everything - every sales call, demo, consultation.

**Stores**:
- **Timing**: scheduledAt, startTime, endTime
- **Status**: booked, showed, no_show, signed, cancelled, rescheduled
- **People**: contactId, closerId, setterId
- **Attribution**: calendarId, attributionSource, trafficSourceId
- **Outcome**: outcome, cashCollected, saleId
- **PCN Data**: All the post-call notes fields (objection type, qualification, notes, etc.)
- **Zoom**: transcript, meeting ID
- **PCN Tracking**: pcnSubmitted, pcnSubmittedAt, pcnSubmittedByUserId

**Key Relationships**:
- Belongs to Contact
- Belongs to Company
- Has optional Closer (User)
- Has optional Setter (User)
- Links to Calendar (for attribution)
- Links to Sale (if closed)
- Has many PCNChangelog entries

**Special Features**:
- `appointmentInclusionFlag`: Tracks which appointments count in metrics (handles reschedules)
- `pcnSubmitted`: Tracks if PCN has been submitted (required by 6PM Eastern)

#### Sale (Payments Received)
**Purpose**: Represents actual money received from customers.

**Stores**:
- Amount, currency, status
- External ID (unique payment processor ID)
- Processor (whop, stripe, etc.)
- Customer email/name
- Match information (matchedBy, matchConfidence, manuallyMatched)
- Links to Appointment

**Key Relationships**:
- Belongs to Company
- Links to Appointment (if matched)
- Links to Contact
- Links to User (rep who gets commission)
- Has one Commission

#### Commission (Earnings)
**Purpose**: Calculated earnings for reps based on closed sales.

**Stores**:
- Total amount (sale amount × commission rate)
- Released amount (for partial payments)
- Status (pending, approved, paid)
- Release status (pending, partial, released, paid)
- Override fields (for manual adjustments)

**Key Relationships**:
- Belongs to Sale
- Belongs to User (rep)
- Belongs to Company

**Calculation Logic**:
- If full payment: `totalCommission = saleAmount × rate`, `releasedCommission = totalCommission`
- If partial payment: `totalCommission = saleAmount × rate`, `releasedCommission = totalCommission × (paymentAmount / saleAmount)`

#### Calendar (Attribution Source)
**Purpose**: GHL calendars synced into the system for tracking marketing sources.

**Stores**:
- Calendar name, description
- GHL Calendar ID (for syncing)
- Traffic source (manually set or extracted from name)
- Default closer (optional auto-assignment)
- Is closer calendar flag

**Key Relationships**:
- Belongs to Company
- Has many Appointments

#### WebhookEvent (Audit Trail)
**Purpose**: Stores all incoming webhooks for debugging and reprocessing.

**Stores**:
- Processor (ghl, whop, clerk, zoom)
- Event type
- Full payload (JSON)
- Processing status
- Error messages (if processing failed)

**Key Relationships**:
- Belongs to Company (optional)

### Data Relationships Summary

```
Company
  ├── Users (reps, admins)
  ├── Contacts (customers)
  ├── Appointments (sales calls)
  │   ├── Contact (who it's with)
  │   ├── Closer (User)
  │   ├── Setter (User)
  │   ├── Calendar (where it came from)
  │   └── Sale (if closed)
  ├── Sales (payments)
  │   ├── Appointment (source)
  │   └── Commission (earnings)
  ├── Commissions (earnings)
  │   ├── Sale (source)
  │   └── User (earner)
  └── Calendars (attribution sources)
```

### Data Isolation (Multi-Tenancy)

**How it works**:
- Every query filters by `companyId`
- Users can only see data from their company
- Super admins can view any company (with `viewAs` parameter)
- Database indexes on `companyId` for performance

**Example**:
```typescript
// When fetching appointments, we always filter:
const appointments = await prisma.appointment.findMany({
  where: {
    companyId: user.companyId,  // ← Always filter by company
    // ... other filters
  }
})
```

---

## Part 3: How We Present Data

Data is presented through dashboards, analytics pages, and reports. All data flows from the database through API endpoints to React components.

### Data Flow: Database → API → Frontend

```
PostgreSQL Database
    ↓
API Route (e.g., /api/admin/company-stats)
    ↓
Business Logic (aggregations, calculations)
    ↓
JSON Response
    ↓
React Component (fetches via fetch())
    ↓
UI Display (charts, tables, cards)
```

### 1. Dashboard Page (`/dashboard`)

**What it shows**: High-level overview of performance metrics.

**Data Source**: `/api/admin/company-stats` (for admins) or `/api/rep/stats` (for reps)

**How data is fetched**:
1. User visits dashboard
2. React component (`dashboard-client.tsx`) calls API
3. API queries database with filters (date range, company)
4. API calculates metrics:
   - Total appointments (count)
   - Show rate (showed / scheduled)
   - Close rate (signed / showed)
   - Total revenue (sum of cashCollected + Sale amounts)
   - Commission totals (for reps)
5. API returns JSON
6. Component displays in cards and tables

**Metrics Calculated**:
- **Total Appointments**: Count of all appointments in date range
- **Show Rate**: `(showed + signed) / (scheduled - cancelled)`
- **Close Rate**: `signed / (showed + signed)`
- **Revenue**: Sum of `cashCollected` from appointments + `amount` from matched Sales
- **Commissions**: Sum of commission amounts by status (pending, released, paid)

**What's displayed**:
- KPI cards (4 main metrics)
- Commission tracker (for reps)
- Recent appointments table
- Recent commissions table (for reps)
- Leaderboard widget
- Pending PCNs widget

### 2. Analytics Page (`/analytics`)

**What it shows**: Deep dive into performance with filters, breakdowns, and comparisons.

**Data Source**: `/api/analytics` with query parameters

**How data is fetched**:
1. User applies filters (date range, closer, calendar, status, etc.)
2. Component calls `/api/analytics?dateFrom=...&closer=...&calendar=...`
3. API builds complex database queries:
   - Filters appointments by all criteria
   - Groups by different dimensions (closer, day of week, time of day, calendar)
   - Calculates metrics for each group
4. API returns structured data:
   - Overall metrics
   - Breakdowns by dimension
   - Time series data (by date)
   - Comparison data (if comparison mode enabled)

**Metrics Calculated**:
- **Show Rate**: `showed / scheduled` (excluding missing PCNs)
- **Close Rate**: `signed / showed`
- **Cancellation Rate**: `cancelled / scheduled`
- **No Show Rate**: `no_show / scheduled`
- **Qualified Rate**: `qualified / showed`
- **Revenue per Scheduled**: `totalRevenue / scheduled`
- **Revenue per Show**: `totalRevenue / showed`
- **Average Sales Cycle**: Average days from first call to close
- **Average Lead Time**: Average days from booking to appointment

**Breakdowns Available**:
- By Closer (performance per rep)
- By Day of Week (which days perform best)
- By Time of Day (morning vs afternoon vs evening)
- By Calendar/Source (which marketing channels work)
- By Appointment Type (first call vs follow-up)
- By Objection Type (what objections come up)

**What's displayed**:
- Metric cards (clickable for details)
- Charts (time series, bar charts, stacked bars)
- Tables (sortable, searchable, exportable)
- Comparison view (compare two segments side-by-side)

### 3. Leaderboard (`/leaderboard`)

**What it shows**: Ranked list of reps by performance.

**Data Source**: `/api/rep/leaderboard`

**How data is fetched**:
1. Component calls API with date range
2. API queries appointments and sales
3. API groups by rep (closer)
4. API calculates per rep:
   - Total appointments
   - Closed deals
   - Total revenue
   - Total commissions
5. API sorts by revenue (descending)
6. API returns ranked list

**What's displayed**:
- Ranked list with:
  - Rank (1st, 2nd, 3rd with medals)
  - Rep name and email
  - Appointments count
  - Closed deals count
  - Revenue total
  - Commissions total
- Highlights current user
- Expandable details per rep

### 4. Commissions Page (`/commissions`)

**What it shows**: Detailed view of all commissions for a rep.

**Data Source**: Commission records filtered by rep

**How data is fetched**:
1. Component queries Commission table
2. Filters by `repId = currentUser.id`
3. Groups by status (pending, released, paid)
4. Calculates totals per status

**What's displayed**:
- Commission breakdown by status
- List of all commissions
- Payment timeline
- Override history

### 5. Pending PCNs Widget

**What it shows**: Appointments that need PCN submission.

**Data Source**: `/api/appointments/pending-pcns`

**How data is fetched**:
1. Component calls API
2. API queries appointments where:
   - `pcnSubmitted = false`
   - `scheduledAt` is in the past
   - `scheduledAt` is before 6PM Eastern today (if today)
3. API groups by closer
4. API calculates urgency (high, medium, normal) based on how overdue
5. API returns grouped list

**What's displayed**:
- Total count of pending PCNs
- Grouped by closer
- Urgency indicators (color-coded)
- Click to navigate to appointments page

### 6. Recent Appointments Table

**What it shows**: Latest appointments with key details.

**Data Source**: Appointment records

**How data is fetched**:
1. Component queries Appointment table
2. Filters by company and date range
3. Includes related data (Contact, Closer, Setter, Calendar)
4. Sorts by `scheduledAt` descending
5. Limits to 10 most recent

**What's displayed**:
- Contact name
- Scheduled date/time
- Status badge (color-coded)
- Closer/Setter names
- Calendar/source
- Cash collected (if signed)
- PCN status button

### Data Presentation Patterns

#### 1. Aggregation Pattern
**When**: We need totals, averages, counts
**How**: Use Prisma `aggregate()` or `count()` functions
**Example**: 
```typescript
const totalRevenue = await prisma.appointment.aggregate({
  where: { companyId, status: 'signed' },
  _sum: { cashCollected: true }
})
```

#### 2. Grouping Pattern
**When**: We need breakdowns (by closer, by day, etc.)
**How**: Query all records, then group in JavaScript
**Example**:
```typescript
const appointments = await prisma.appointment.findMany({...})
const byCloser = appointments.reduce((acc, apt) => {
  const closerId = apt.closerId || 'unassigned'
  if (!acc[closerId]) acc[closerId] = { total: 0, signed: 0, revenue: 0 }
  acc[closerId].total++
  if (apt.status === 'signed') {
    acc[closerId].signed++
    acc[closerId].revenue += apt.cashCollected || 0
  }
  return acc
}, {})
```

#### 3. Filtering Pattern
**When**: Users apply filters
**How**: Build dynamic `where` clause from filter parameters
**Example**:
```typescript
const where: any = { companyId }
if (closerId) where.closerId = closerId
if (dateFrom) where.scheduledAt = { gte: new Date(dateFrom) }
if (status) where.status = status
```

#### 4. Time Zone Handling
**When**: Displaying dates/times
**How**: 
- Store all dates in UTC in database
- Convert to company timezone when displaying
- Use `getCompanyTimezone()` helper
**Example**:
```typescript
const companyTimezone = getCompanyTimezone(company)
const localDate = new Date(appointment.scheduledAt).toLocaleString('en-US', {
  timeZone: companyTimezone
})
```

---

## Data Flow Examples

### Example 1: New Appointment Booked

**Step 1: Intake**
- Customer books appointment in GHL
- GHL sends webhook to `/api/webhooks/ghl`
- Webhook contains: appointment data, contact data, calendar info

**Step 2: Storage**
- System creates/updates Contact record
- System creates Appointment record with:
  - `scheduledAt` = appointment time
  - `status` = "booked"
  - `contactId` = linked to Contact
  - `calendarId` = linked to Calendar
  - `closerId` = matched from GHL user (if available)
- System resolves attribution (sets `attributionSource`)
- System stores webhook in `WebhookEvent` table

**Step 3: Presentation**
- Appointment appears in dashboard "Recent Appointments"
- Counts toward "Total Appointments" metric
- Shows in analytics with filters applied
- Appears in pending PCNs list (after scheduled time passes)

### Example 2: Payment Received

**Step 1: Intake**
- Customer pays via Whop
- Whop sends webhook to `/api/webhooks/whop?company=xxx&secret=xxx`
- Webhook contains: amount, customer email, payment ID

**Step 2: Storage**
- System creates Sale record
- System tries to match to Appointment:
  - Checks email match → finds Contact → finds Appointment
  - Confidence: 90% (email match)
- System creates Commission record:
  - `totalAmount` = sale amount × commission rate
  - `releasedAmount` = totalAmount (if full payment)
- System links Sale to Appointment
- System updates Appointment status to "signed" (if was "showed")

**Step 3: Presentation**
- Sale appears in revenue calculations
- Commission appears in rep's commission tracker
- Appointment shows as "signed" in dashboard
- Revenue metrics update (total revenue, revenue per call)

### Example 3: PCN Submitted

**Step 1: Intake**
- Rep submits PCN form via `/api/appointments/[id]/submit-pcn`
- Form contains: outcome, qualification, objections, notes, cash collected

**Step 2: Storage**
- System updates Appointment record:
  - `status` = outcome (signed, showed, no_show, etc.)
  - `pcnSubmitted` = true
  - `pcnSubmittedAt` = now
  - `pcnSubmittedByUserId` = rep's ID
  - All PCN fields saved (objection type, notes, etc.)
- If status is "signed" and cash collected:
  - System tries to match with pending payments
  - If match found, creates Commission
- System creates PCNChangelog entry (audit trail)

**Step 3: Presentation**
- Appointment removed from "Pending PCNs" list
- Appointment status updates in dashboard
- Metrics recalculate (show rate, close rate)
- PCN data visible in appointment details

---

## Key System Features

### 1. Intelligent Payment Matching

**Problem**: Payments come from processors, but we need to link them to appointments.

**Solution**: Multi-strategy matching with confidence scores:
- Direct match (appointment ID): 100% confidence
- Email match: 90% confidence
- Phone match: 85% confidence
- Fuzzy name + amount + date: 70-95% confidence

**Fallback**: If confidence < 70%, flag for manual review in Unmatched Payments queue.

### 2. Attribution Resolution

**Problem**: Need to know where each lead came from (Facebook, Google, etc.).

**Solution**: Configurable strategies per company:
- **GHL Fields**: Read from Contact custom fields
- **Calendar Names**: Extract from calendar name patterns like "Sales Call (META)"
- **Tags**: Search Contact tags for source patterns
- **Hyros**: Future integration for Hyros attribution

**Result**: Every appointment gets an `attributionSource` for analytics.

### 3. Progressive Commission Release

**Problem**: Payment plans mean partial payments over time.

**Solution**: Commission is calculated on full sale amount, but released proportionally:
- $10K sale, 10% rate = $1K total commission
- $5K payment received = $500 commission released
- $5K payment later = $500 more commission released

**Tracking**: `totalAmount` vs `releasedAmount` in Commission record.

### 4. Appointment Inclusion Flag

**Problem**: Rescheduled appointments shouldn't be double-counted.

**Solution**: `appointmentInclusionFlag` field:
- `null` or `0` = don't count (superseded by reschedule)
- `1` = first countable appointment
- `2+` = follow-up appointments

**Usage**: Only count appointments where flag is `1` in metrics.

### 5. Missing PCN Exclusion

**Problem**: Show rate should exclude appointments without PCNs (not yet processed).

**Solution**: 
- PCN required by 6PM Eastern on appointment day
- Missing PCNs excluded from show rate denominator
- Formula: `Show Rate = Shown / (Scheduled - Missing PCNs)`

**Tracking**: `pcnSubmitted` flag and `pcnSubmittedAt` timestamp.

### 6. Multi-Tenant Data Isolation

**Problem**: Multiple companies using same database.

**Solution**: 
- Every record has `companyId`
- All queries filter by `companyId`
- Users can only access their company's data
- Super admins can view any company (with `viewAs`)

**Enforcement**: Database indexes, API filters, UI permissions.

---

## Summary

**Data Intake**:
- Webhooks from GHL (appointments), payment processors (revenue), Clerk (users), Zoom (transcripts)
- Manual PCN submission forms
- Excel/CSV bulk imports

**Data Storage**:
- PostgreSQL database with Prisma ORM
- Multi-tenant architecture (Company-based isolation)
- Relational structure (Company → Users, Appointments, Sales, Commissions)
- Audit trails (WebhookEvent, PCNChangelog)

**Data Presentation**:
- Dashboard: High-level KPIs and recent activity
- Analytics: Deep dives with filters, breakdowns, comparisons
- Leaderboard: Ranked rep performance
- Commissions: Detailed earnings view
- Real-time updates via API calls

**Key Flows**:
1. Appointment booked → Webhook → Contact/Appointment created → Shows in dashboard
2. Payment received → Webhook → Sale created → Matched to Appointment → Commission calculated → Updates metrics
3. PCN submitted → Form → Appointment updated → Metrics recalculate → Removed from pending list

The system is designed to be **real-time** (webhooks), **intelligent** (auto-matching), **flexible** (configurable attribution), and **secure** (multi-tenant isolation).


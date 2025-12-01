# Revphlo Developer Onboarding Guide

Welcome to the Revphlo codebase! This guide will help you understand the system architecture, key patterns, and how to get started contributing.

---

## 1. The Big Picture

### What Does This App Actually Do?

**Revphlo is a sales commission management platform** that helps sales teams track appointments, match payments to deals, calculate commissions, and analyze performance.

Think of it like this: A sales rep books an appointment with a customer through GoHighLevel (a calendar booking system). The appointment happens, and the rep submits a "Post-Call Note" (PCN) saying whether they closed the deal. Later, when the customer pays (via Whop, Stripe, etc.), the system automatically matches that payment to the appointment, calculates the rep's commission, and tracks everything in dashboards and analytics.

### Who Uses It and What Problems Does It Solve?

**Users:**
- **Sales Reps/Closers**: Track their appointments, submit PCNs, view their commissions
- **Company Admins**: Manage team, view company-wide metrics, match payments, configure integrations
- **Super Admins**: Manage multiple companies, view system-wide analytics

**Problems Solved:**
1. **Manual Commission Calculation**: Instead of spreadsheets, commissions are automatically calculated when payments are received
2. **Payment Matching**: Automatically links payments to appointments using intelligent matching (email, phone, name, amount)
3. **Performance Tracking**: Real-time dashboards show show rates, close rates, revenue per rep
4. **Attribution**: Tracks where leads came from (Facebook, Google, etc.) for marketing ROI
5. **PCN Management**: Ensures reps submit post-call notes by 6PM Eastern, tracks missing submissions
6. **Multi-Tenant**: Each company's data is completely isolated

---

## 2. Tech Stack Overview

| Technology | Purpose in This Project |
|------------|------------------------|
| **Next.js 16.0.0** | React framework with App Router - handles routing, SSR, API routes |
| **React 19.2.0** | UI library for building interactive components |
| **TypeScript 5.x** | Type-safe JavaScript - catches errors at compile time |
| **Prisma 6.18.0** | ORM (Object-Relational Mapping) - type-safe database access |
| **PostgreSQL** | Database (hosted on Supabase/Neon) - stores all app data |
| **Clerk 6.34.0** | Authentication service - handles user signup, login, sessions |
| **Tailwind CSS 4.x** | Utility-first CSS framework - styling components |
| **Shadcn/ui** | Component library built on Radix UI - pre-built accessible components |
| **Recharts** | Charting library - powers analytics visualizations |
| **OpenAI API** | AI features - analyzes Zoom transcripts, powers AI chat |
| **Slack Web API** | Slack integration - sends PCN notifications, weekly reports |
| **Zoom API** | Zoom integration - receives call transcripts for AI analysis |
| **GoHighLevel API** | CRM integration - receives appointment webhooks, syncs calendars/users |
| **Vercel** | Hosting platform - deploys the app, handles serverless functions |
| **date-fns** | Date manipulation library - handles timezone conversions, date formatting |
| **Zod** | Schema validation - validates API request/response data |
| **Svix** | Webhook verification - verifies Clerk webhook signatures |

---

## 3. Architecture Map

### High-Level Architecture

```
┌─────────────────┐
│   Frontend      │
│  (Next.js App)  │
│  - Dashboard    │
│  - Analytics    │
│  - PCN Forms    │
└────────┬────────┘
         │
         │ HTTP Requests
         │
┌────────▼────────┐
│   API Routes    │
│  (/api/*)       │
│  - Auth checks  │
│  - Business     │
│    logic        │
└────────┬────────┘
         │
         │ Prisma Client
         │
┌────────▼────────┐
│   PostgreSQL    │
│   Database      │
│  - Companies    │
│  - Appointments │
│  - Sales        │
│  - Commissions  │
└─────────────────┘

External Services:
├── Clerk (Auth)
├── GHL (Appointments)
├── Whop/Stripe (Payments)
├── Slack (Notifications)
├── Zoom (Transcripts)
└── OpenAI (AI Analysis)
```

### Request Lifecycle: What Happens When a User Clicks a Button

**Example: User submits a PCN (Post-Call Note)**

1. **User Action**: Rep clicks "Submit PCN" button on appointment page
2. **Frontend**: React component (`app/(dashboard)/pcn/[appointmentId]/page.tsx`) collects form data
3. **API Call**: `fetch('/api/appointments/[id]/submit-pcn', { method: 'POST', body: ... })`
4. **Middleware**: `middleware.ts` checks if user is authenticated (Clerk)
5. **API Route**: `app/api/appointments/[id]/submit-pcn/route.ts` receives request
6. **Auth Check**: `getEffectiveUser()` verifies user has permission (must be closer or admin)
7. **Business Logic**: 
   - Updates `Appointment` record with PCN data
   - If status is "signed", tries to match with pending payments
   - Creates `Commission` if payment matched
   - Creates `PCNChangelog` entry for audit trail
8. **Database**: Prisma writes to PostgreSQL
9. **Response**: API returns success/error JSON
10. **Frontend**: Component shows success toast, redirects to dashboard
11. **UI Update**: Dashboard refreshes, appointment removed from "Pending PCNs" list

### Data Flow: Webhook → Database → Dashboard

**Example: New appointment booked in GHL**

1. **Webhook Received**: GHL sends POST to `/api/webhooks/ghl/marketplace`
2. **Signature Verification**: System verifies webhook signature (HMAC-SHA256)
3. **Event Logging**: Creates `WebhookEvent` record (for debugging)
4. **Company Lookup**: Finds `Company` by `locationId` from webhook payload
5. **Contact Creation**: Creates/updates `Contact` record
6. **Appointment Creation**: Creates `Appointment` record with:
   - `scheduledAt` from webhook
   - `status = "booked"`
   - Links to `Contact`, `Calendar`, `Closer` (if matched)
7. **Attribution Resolution**: Determines `attributionSource` (Facebook, Google, etc.)
8. **Dashboard Update**: Next time user loads dashboard, appointment appears in "Recent Appointments"

---

## 4. Folder Structure Guide

### Top-Level Folders

```
saas/
├── app/                    # Next.js App Router - pages and API routes
│   ├── (dashboard)/       # Dashboard pages (grouped route)
│   │   ├── dashboard/     # Main dashboard page
│   │   ├── analytics/     # Analytics page
│   │   ├── admin/         # Admin-only pages
│   │   └── layout.tsx     # Dashboard layout (nav, sidebar)
│   ├── api/               # API routes (backend)
│   │   ├── admin/         # Admin API endpoints
│   │   ├── webhooks/      # Webhook handlers
│   │   └── appointments/  # Appointment API
│   ├── onboard/           # Onboarding flow
│   └── layout.tsx         # Root layout (Clerk, theme)
│
├── components/             # Reusable React components
│   ├── ui/                # Shadcn/ui components (Button, Card, etc.)
│   ├── Leaderboard.tsx    # Leaderboard widget
│   └── PendingPCNsWidget.tsx
│
├── lib/                    # Shared utilities and business logic
│   ├── db.ts              # Prisma client wrapper
│   ├── auth.ts            # Authentication helpers
│   ├── payment-matcher.ts # Payment matching algorithm
│   ├── attribution.ts     # Attribution resolution
│   ├── ghl-api.ts         # GHL API client
│   └── webhooks/          # Webhook handlers
│
├── prisma/                 # Database schema and migrations
│   ├── schema.prisma      # Database schema definition
│   └── migrations/       # Migration history
│
├── types/                  # TypeScript type definitions
│   ├── api.ts             # API request/response types
│   ├── appointments.ts    # Appointment types
│   └── pcn.ts             # PCN types
│
├── scripts/               # Utility scripts
│   ├── check-env-vars.ts  # Environment validation
│   └── *.ts               # Other scripts
│
└── public/                 # Static assets (images, etc.)
```

### 10-15 Most Important Files to Read First

**Start Here (Core Understanding):**
1. **`prisma/schema.prisma`** - Database structure - understand the data models
2. **`app/layout.tsx`** - Root layout - see how auth and theming are set up
3. **`middleware.ts`** - Authentication middleware - understand route protection
4. **`lib/db.ts`** - Database connection - see how Prisma is used
5. **`lib/auth.ts`** - Auth helpers - understand user/company context

**Business Logic:**
6. **`lib/payment-matcher.ts`** - Payment matching algorithm - core feature
7. **`lib/attribution.ts`** - Attribution resolution - how we track lead sources
8. **`app/api/webhooks/ghl/marketplace/route.ts`** - GHL webhook handler - main data intake
9. **`app/api/webhooks/whop/route.ts`** - Payment webhook handler - revenue intake

**User Flows:**
10. **`app/(dashboard)/dashboard/page.tsx`** - Main dashboard - see how data is displayed
11. **`app/api/appointments/[id]/submit-pcn/route.ts`** - PCN submission - key user action
12. **`app/(dashboard)/pcn/[appointmentId]/page.tsx`** - PCN form UI

**Configuration:**
13. **`package.json`** - Dependencies - see what libraries are used
14. **`next.config.ts`** - Next.js config - build settings
15. **`.env.example`** (if exists) - Environment variables - what needs to be configured

---

## 5. Data Models & Database

### Core Database Tables

**Company** (Root Entity)
- Every other record belongs to a `Company` (multi-tenant architecture)
- Stores integration credentials (GHL OAuth tokens, Slack tokens, Zoom tokens)
- Stores configuration (attribution strategy, timezone, PCN settings)
- **Key Fields**: `id`, `name`, `email`, `ghlLocationId`, `attributionStrategy`

**User** (People in the System)
- Represents reps, closers, setters, admins
- Links to Clerk for authentication (`clerkId`)
- Links to GHL user for auto-assignment (`ghlUserId`)
- Has commission rate (from `CommissionRole` or `customCommissionRate`)
- **Key Fields**: `id`, `email`, `name`, `role`, `companyId`, `ghlUserId`

**Contact** (Customers/Prospects)
- The people who book appointments
- Links to GHL contact (`ghlContactId`)
- Has tags for attribution
- **Key Fields**: `id`, `name`, `email`, `phone`, `companyId`, `tags`

**Appointment** (Sales Calls)
- The center of everything - every sales call, demo, consultation
- Links to `Contact`, `Closer` (User), `Setter` (User), `Calendar`
- Stores PCN data (outcome, objections, notes, cash collected)
- Has status: `booked`, `showed`, `no_show`, `signed`, `cancelled`, `rescheduled`
- **Key Fields**: `id`, `scheduledAt`, `status`, `contactId`, `closerId`, `pcnSubmitted`, `cashCollected`

**Sale** (Payments Received)
- Represents actual money received from customers
- Links to `Appointment` (if matched)
- Has matching info (`matchedBy`, `matchConfidence`, `manuallyMatched`)
- **Key Fields**: `id`, `amount`, `externalId`, `processor`, `appointmentId`, `customerEmail`

**Commission** (Earnings)
- Calculated earnings for reps based on closed sales
- Links to `Sale` and `User` (rep)
- Tracks release status (for partial payments)
- **Key Fields**: `id`, `totalAmount`, `releasedAmount`, `status`, `saleId`, `repId`

**Calendar** (Attribution Source)
- GHL calendars synced into the system
- Used for attribution (which marketing channel)
- **Key Fields**: `id`, `name`, `ghlCalendarId`, `trafficSource`, `companyId`

**WebhookEvent** (Audit Trail)
- Stores all incoming webhooks for debugging
- **Key Fields**: `id`, `processor`, `eventType`, `payload`, `processed`, `error`

### Data Relationships

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

### Multi-Tenancy (Data Isolation)

**How it works:**
- Every record has a `companyId` field
- All database queries filter by `companyId`
- Users can only see data from their company
- Super admins can view any company (using `viewAs` parameter)

**Example Query:**
```typescript
const appointments = await prisma.appointment.findMany({
  where: {
    companyId: user.companyId,  // ← Always filter by company
    status: 'signed'
  }
})
```

---

## 6. Key User Flows

### Flow 1: New Appointment Booked → Dashboard Display

**Files Involved:**
- `app/api/webhooks/ghl/marketplace/route.ts` (webhook handler)
- `lib/webhooks/handlers/appointment-created.ts` (appointment creation logic)
- `lib/attribution.ts` (attribution resolution)
- `app/api/admin/company-stats/route.ts` (dashboard data)
- `app/(dashboard)/dashboard/dashboard-client.tsx` (dashboard UI)

**Steps:**
1. Customer books appointment in GHL
2. GHL sends webhook to `/api/webhooks/ghl/marketplace`
3. System verifies webhook signature
4. Creates/updates `Contact` record
5. Creates `Appointment` record with `status = "booked"`
6. Resolves attribution (sets `attributionSource`)
7. Matches GHL user to our `User` (sets `closerId`)
8. User loads dashboard → API fetches appointments → Displays in "Recent Appointments"

### Flow 2: Payment Received → Commission Calculated

**Files Involved:**
- `app/api/webhooks/whop/route.ts` (payment webhook handler)
- `lib/payment-matcher.ts` (matching algorithm)
- `app/api/appointments/[id]/submit-pcn/route.ts` (PCN submission - can trigger matching)

**Steps:**
1. Customer pays via Whop/Stripe
2. Payment processor sends webhook to `/api/webhooks/whop?company=xxx&secret=xxx`
3. System creates `Sale` record
4. **Payment Matching** (`lib/payment-matcher.ts`):
   - Tries direct match (appointment ID from payment link): 100% confidence
   - Tries email match: 90% confidence
   - Tries phone match: 85% confidence
   - Tries fuzzy name + amount + date: 70-95% confidence
5. If confidence ≥ 70%:
   - Links `Sale` to `Appointment`
   - Gets rep's commission rate (from `CommissionRole` or `customCommissionRate`)
   - Calculates commission: `totalAmount = saleAmount × rate`
   - Creates `Commission` record
   - Updates appointment status to "signed" (if was "showed")
6. If confidence < 70%:
   - Creates `UnmatchedPayment` record for admin review
7. Admin can manually match in `/admin/payments` page

### Flow 3: PCN Submission → Metrics Update

**Files Involved:**
- `app/(dashboard)/pcn/[appointmentId]/page.tsx` (PCN form UI)
- `app/api/appointments/[id]/submit-pcn/route.ts` (PCN submission API)
- `lib/pcn-submission.ts` (PCN processing logic)
- `app/api/analytics/route.ts` (analytics calculation)

**Steps:**
1. Rep opens appointment page
2. Clicks "Submit PCN" button
3. Fills out form:
   - Outcome (signed, showed, no_show, cancelled)
   - Qualification status
   - Objection type (if didn't close)
   - Notes
   - Cash collected (if signed)
4. Submits via `POST /api/appointments/[id]/submit-pcn`
5. System updates `Appointment` record:
   - Sets `status` to outcome
   - Sets `pcnSubmitted = true`
   - Saves all PCN fields
6. If status is "signed" and cash collected:
   - Tries to match with pending `UnmatchedPayment` records
   - If match found, creates `Commission`
7. Creates `PCNChangelog` entry (audit trail)
8. Dashboard refreshes → Appointment removed from "Pending PCNs"
9. Analytics recalculate → Show rate, close rate update

### Flow 4: User Signup → Company Creation

**Files Involved:**
- `app/api/webhooks/clerk/route.ts` (Clerk webhook handler)
- `app/onboard/page.tsx` (onboarding flow)
- `app/api/onboard/route.ts` (company creation)

**Steps:**
1. User signs up via Clerk (at `/sign-up`)
2. Clerk sends webhook to `/api/webhooks/clerk`
3. System verifies webhook signature (Svix)
4. Creates `User` record with `clerkId`
5. User redirected to onboarding flow (`/onboard`)
6. User selects "Create Company" or "Join Company"
7. If creating: System creates `Company` record, links `User` to it
8. If joining: User enters invite code, system links `User` to existing `Company`
9. User redirected to dashboard

### Flow 5: Analytics Query → Chart Display

**Files Involved:**
- `app/(dashboard)/analytics/page.tsx` (analytics UI)
- `app/api/analytics/route.ts` (analytics API)
- `lib/analytics-kpi.ts` (KPI calculations)
- `lib/analytics-comparison.ts` (comparison logic)

**Steps:**
1. User navigates to `/analytics`
2. User applies filters (date range, closer, calendar, status)
3. Frontend calls `GET /api/analytics?dateFrom=...&closer=...`
4. API builds database query with filters
5. API fetches appointments matching criteria
6. API calculates metrics:
   - Show rate: `showed / scheduled`
   - Close rate: `signed / showed`
   - Revenue per scheduled
   - Breakdowns by closer, day, time, calendar
7. API returns JSON with metrics and breakdowns
8. Frontend displays in charts (Recharts) and tables
9. User can enable comparison mode → API fetches comparison data → Displays side-by-side

---

## 7. Patterns & Conventions

### Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js App Router convention)
- API routes: `route.ts` (Next.js App Router convention)
- Components: `PascalCase.tsx` (e.g., `Leaderboard.tsx`)
- Utilities: `kebab-case.ts` (e.g., `payment-matcher.ts`)

**Variables:**
- `camelCase` for variables and functions
- `PascalCase` for React components and types
- `UPPER_SNAKE_CASE` for constants

**Database:**
- Models: `PascalCase` (e.g., `Appointment`, `Commission`)
- Fields: `camelCase` (e.g., `scheduledAt`, `pcnSubmitted`)

### File Organization

**API Routes:**
- Grouped by feature: `/api/admin/...`, `/api/webhooks/...`
- Each route file exports `GET`, `POST`, etc. functions
- Always use `export const dynamic = 'force-dynamic'` for webhook routes

**Components:**
- Reusable components in `/components`
- Page-specific components co-located with page
- UI primitives in `/components/ui` (Shadcn)

**Business Logic:**
- Pure functions in `/lib`
- Database queries use Prisma via `withPrisma()` wrapper
- No direct database access - always go through Prisma

### State Management

**Server Components (Default):**
- Next.js App Router uses Server Components by default
- Data fetching happens on server
- No `useState`, `useEffect` needed

**Client Components:**
- Mark with `'use client'` directive
- Use `useState`, `useEffect` for interactive UI
- Fetch data via `fetch()` calls to API routes

**Example Pattern:**
```typescript
// Server Component (page.tsx)
export default async function DashboardPage() {
  const user = await getEffectiveUser()  // Server-side
  return <DashboardClient user={user} />
}

// Client Component (dashboard-client.tsx)
'use client'
export default function DashboardClient({ user }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch('/api/admin/company-stats').then(...)  // Client-side
  }, [])
  return <div>...</div>
}
```

### Database Access Pattern

**Always use `withPrisma()` wrapper:**
```typescript
import { withPrisma } from '@/lib/db'

const result = await withPrisma(async (prisma) => {
  return await prisma.appointment.findMany({
    where: { companyId }
  })
})
```

**Why?** The wrapper handles connection pooling and error handling.

### Authentication Pattern

**Get Current User:**
```typescript
import { getEffectiveUser } from '@/lib/auth'

const user = await getEffectiveUser()
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Require Admin:**
```typescript
import { requireAdmin } from '@/lib/auth'

const user = await requireAdmin()  // Throws if not admin
```

**Company Context:**
```typescript
import { getEffectiveCompanyId } from '@/lib/company-context'

const companyId = await getEffectiveCompanyId(request.url)
// Handles super admin "viewAs" parameter
```

### Error Handling

**API Routes:**
```typescript
export async function POST(request: NextRequest) {
  try {
    // ... logic
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
```

**Always log errors** for debugging in production.

### Gotchas & Non-Obvious Things

1. **Multi-Tenancy**: Always filter by `companyId` in queries. Super admins can use `viewAs` parameter.

2. **Timezone Handling**: All dates stored in UTC. Convert to company timezone when displaying:
   ```typescript
   const companyTimezone = getCompanyTimezone(company)
   const localDate = new Date(appointment.scheduledAt).toLocaleString('en-US', {
     timeZone: companyTimezone
   })
   ```

3. **Webhook Signature Verification**: All webhooks verify signatures. GHL uses HMAC-SHA256, Clerk uses Svix.

4. **Payment Matching Confidence**: Payments with confidence < 70% go to `UnmatchedPayment` queue for manual review.

5. **PCN Deadline**: PCNs must be submitted by 6PM Eastern on appointment day. Missing PCNs are excluded from show rate calculations.

6. **Appointment Inclusion Flag**: Rescheduled appointments have `appointmentInclusionFlag` set to prevent double-counting in metrics.

7. **OAuth Token Encryption**: GHL OAuth tokens are encrypted before storage (AES-256-GCM).

8. **Server Components vs Client Components**: Default is Server Component. Add `'use client'` only when needed (interactivity, hooks).

9. **Database Migrations**: Always run `npx prisma db push` after schema changes. Never edit migrations manually.

10. **Environment Variables**: Use `.env.local` for local development. Never commit `.env` files.

---

## 8. Local Development Setup

### Prerequisites

- **Node.js 18+** (check with `node --version`)
- **PostgreSQL database** (Supabase/Neon account, or local PostgreSQL)
- **Clerk account** (for authentication)
- **Git** (for version control)

### Step-by-Step Setup

**1. Clone the Repository**
```bash
git clone https://github.com/Revphlo/saas.git
cd saas
```

**2. Install Dependencies**
```bash
npm install
```

**3. Set Up Environment Variables**

Create a `.env.local` file in the project root:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"
DIRECT_URL="postgresql://user:password@host:5432/database"  # Same as DATABASE_URL for local

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# GHL Marketplace OAuth (if testing GHL integration)
GHL_MARKETPLACE_CLIENT_ID="your_client_id"
GHL_MARKETPLACE_CLIENT_SECRET="your_client_secret"
GHL_MARKETPLACE_WEBHOOK_SECRET="your_webhook_secret"
GHL_OAUTH_REDIRECT_URI="http://localhost:3000/api/integrations/crm/callback"

# OpenAI (if testing AI features)
OPENAI_API_KEY="sk-..."

# Slack (if testing Slack integration)
SLACK_CLIENT_ID="..."
SLACK_CLIENT_SECRET="..."
SLACK_SIGNING_SECRET="..."

# Zoom (if testing Zoom integration)
ZOOM_CLIENT_ID="..."
ZOOM_CLIENT_SECRET="..."
```

**4. Generate Prisma Client**
```bash
npx prisma generate
```

**5. Push Database Schema**
```bash
npx prisma db push
```

**6. Start Development Server**
```bash
npm run dev
```

The app will be available at **http://localhost:3000**

### Common Issues

**"Prisma Client not generated"**
```bash
npx prisma generate
```

**"Database connection failed"**
- Check `DATABASE_URL` is correct
- Ensure database is accessible
- Try `npx prisma db push` to verify connection

**"Clerk authentication not working"**
- Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set
- Check Clerk dashboard for correct keys

**"Port 3000 already in use"**
```bash
npm run dev -- -p 3001
```

### Database Management

**View Database in Browser:**
```bash
npx prisma studio
```

**Create Migration:**
```bash
npx prisma migrate dev --name migration_name
```

**Reset Database (⚠️ Deletes all data):**
```bash
npx prisma db push --force-reset
```

### Testing Webhooks Locally

**Use ngrok to expose local server:**
```bash
ngrok http 3000
```

Then use the ngrok URL in webhook configurations (e.g., `https://abc123.ngrok.io/api/webhooks/ghl/marketplace`)

---

## 9. Glossary

### Domain Terms

**PCN (Post-Call Note)**
- A form reps submit after appointments with outcome details (signed, showed, no_show, etc.)
- Required by 6PM Eastern on appointment day
- Missing PCNs are excluded from show rate calculations

**Closer**
- The sales rep who conducts the appointment (the one who closes deals)
- Gets commission when appointment is signed

**Setter**
- The rep who booked the appointment (may be different from closer)
- Doesn't get commission (unless configured otherwise)

**Show Rate**
- Metric: `(showed + signed) / (scheduled - cancelled)`
- Excludes appointments with missing PCNs

**Close Rate**
- Metric: `signed / (showed + signed)`
- Percentage of appointments that resulted in a sale

**Attribution**
- Determining where a lead came from (Facebook, Google, etc.)
- Configurable per company (GHL fields, calendar names, tags)

**Payment Matching**
- Process of linking a `Sale` (payment) to an `Appointment`
- Uses multiple strategies (email, phone, name, amount) with confidence scores
- Low confidence (<70%) goes to manual review queue

**Commission**
- Calculated earnings for reps based on closed sales
- Formula: `saleAmount × commissionRate`
- Supports partial payments (released proportionally)

**Unmatched Payment**
- A `Sale` that couldn't be automatically matched to an `Appointment`
- Admins can manually match in `/admin/payments` page

**Appointment Inclusion Flag**
- Field on `Appointment` that prevents double-counting rescheduled appointments
- `null` or `0` = don't count (superseded by reschedule)
- `1` = first countable appointment
- `2+` = follow-up appointments

### Technical Terms

**Multi-Tenancy**
- Architecture where multiple companies share the same database
- Data isolation via `companyId` filtering
- Each company's data is completely separate

**Webhook**
- HTTP POST request sent by external service (GHL, Whop, etc.) when an event occurs
- Real-time data intake (appointments, payments, etc.)

**OAuth**
- Authentication protocol for third-party integrations
- GHL Marketplace uses OAuth 2.0 (authorization code flow)

**Prisma**
- Type-safe database ORM (Object-Relational Mapping)
- Generates TypeScript types from database schema
- Provides type-safe database queries

**Server Component**
- Next.js component that renders on the server
- Can directly access database, no API route needed
- Default in Next.js App Router

**Client Component**
- React component that renders in the browser
- Can use hooks (`useState`, `useEffect`)
- Must be marked with `'use client'` directive

**Middleware**
- Code that runs before requests reach routes
- Used for authentication, redirects, etc.
- Located in `middleware.ts`

**Route Handler**
- API endpoint in Next.js App Router
- File: `app/api/.../route.ts`
- Exports `GET`, `POST`, etc. functions

---

## Next Steps

1. **Read the code**: Start with the 15 important files listed in Section 4
2. **Set up locally**: Follow Section 8 to get the app running
3. **Explore the database**: Run `npx prisma studio` to see the data
4. **Trace a flow**: Pick a user flow from Section 6 and trace through the code
5. **Make a small change**: Fix a bug or add a small feature to get familiar
6. **Ask questions**: Don't hesitate to ask the team for clarification

Welcome to the team! 🚀


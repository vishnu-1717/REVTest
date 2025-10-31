# PayMaestro - Complete System Architecture Documentation

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Technology Stack](#technology-stack)
4. [Architecture Layers](#architecture-layers)
5. [Database Schema & Data Model](#database-schema--data-model)
6. [Authentication & Authorization](#authentication--authorization)
7. [Core Business Logic](#core-business-logic)
8. [API Layer](#api-layer)
9. [Frontend Architecture](#frontend-architecture)
10. [Integrations](#integrations)
11. [Workflow & Data Flow](#workflow--data-flow)
12. [Deployment & Environment](#deployment--environment)

---

## Executive Summary

**PayMaestro** is a comprehensive sales operations and commission management SaaS platform designed for appointment-based businesses (particularly sales teams using Calendar Booking Systems like GoHighLevel). The system automates commission calculations, tracks appointments, matches payments to sales, and provides role-based dashboards for all stakeholders.

### Key Capabilities
- **Multi-tenant SaaS**: Supports multiple companies with complete data isolation
- **Appointment-to-Revenue Tracking**: Links appointments → payments → commissions
- **Intelligent Payment Matching**: Automatically matches payment processor data to appointments using fuzzy matching
- **Role-Based Access**: Reps, Company Admins, and Super Admins with different permissions
- **Real-time Webhooks**: Processes events from GoHighLevel, payment processors, and user management systems
- **Commission Management**: Calculates, releases, and tracks commissions with custom roles and rates
- **Analytics & Reporting**: Provides dashboards for performance tracking and attribution analysis

---

## System Overview

### Application Type
- **Framework**: Next.js 16.0 (React 19.2) with App Router
- **Architecture**: Server-side rendered with client-side interactivity
- **Database**: PostgreSQL via Supabase with Prisma ORM
- **Authentication**: Clerk for user management and session handling
- **Deployment**: Vercel with serverless functions

### Design Principles
1. **Multi-tenancy**: Company-based data isolation with row-level security
2. **API-First**: All business logic in API routes, frontend consumes JSON
3. **Server Components**: Leverage Next.js server components for performance
4. **Type Safety**: TypeScript throughout with Prisma-generated types
5. **Security**: Role-based access control at database, API, and UI layers
6. **Scalability**: Stateless serverless functions, connection pooling

---

## Technology Stack

### Core Dependencies
- **Next.js 16.0**: React framework with App Router
- **React 19.2**: UI library
- **@clerk/nextjs**: Authentication and user management
- **@prisma/client**: Type-safe database ORM
- **@supabase/supabase-js**: Database connection and client
- **TypeScript**: Type safety throughout

### Key Libraries
- **Prisma**: Database schema management, migrations, and query builder
- **Clerk**: Authentication, user sessions, and webhook processing
- **Radix UI**: Accessible component primitives
- **TailwindCSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **Papaparse**: CSV parsing for data import

### Development Tools
- **TypeScript**: Static type checking
- **ESLint**: Code quality and linting
- **tsx**: TypeScript execution for scripts
- **Vercel CLI**: Deployment automation

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                   Frontend Layer                     │
│  (React Components, Client-side State, UI/UX)       │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│                 Next.js App Router                   │
│    (Route Handlers, Server Components, Middleware)   │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│                    API Layer                         │
│  (Business Logic, Authorization, Data Validation)    │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│              Service Layer                           │
│  (Auth Helpers, GHL Client, Attribution, Matching)   │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│            Database Layer (Prisma)                   │
│     (ORM, Queries, Migrations, Type Generation)      │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│          PostgreSQL (Supabase)                       │
│        (Data Storage, Indexes, Relations)            │
└─────────────────────────────────────────────────────┘
```

**Flow**: User Request → Middleware (Auth) → Route Handler → API Logic → Service Layer → Database → Response

---

## Database Schema & Data Model

### Core Models

#### Company (Multi-Tenant Root)
The foundation of all multi-tenancy. Every other entity belongs to exactly one Company.

**Purpose**: Isolates all data by company, enables super admin multi-company management

**Key Fields**:
- `id`, `name`, `email` - Basic company info
- `ghlApiKey`, `ghlLocationId` - GoHighLevel integration
- `attributionStrategy` - How to determine marketing source ("ghl_fields", "calendars", "hyros", "tags", "none")

**Relations**: Has many Users, Appointments, Sales, Commissions

#### User (Identity & Roles)
Represents all people in the system - reps, admins, closers, setters.

**Purpose**: Authentication, authorization, and commission attribution

**Key Fields**:
- `email`, `name`, `role` - Identity
- `clerkId` - Links to Clerk authentication
- `companyId` - Multi-tenant relationship
- `ghlUserId` - Maps to GoHighLevel user for auto-assignment
- `commissionRoleId`, `customCommissionRate` - Commission calculation
- `canViewTeamMetrics` - Permission flag

**Role Hierarchy**:
1. **Super Admin**: Platform-level access, can impersonate, view all companies
2. **Admin**: Company-level access, manages users, sees all data
3. **Rep/Closer/Setter**: Own data + team leaderboard

**Relations**: Can be closer/setter on Appointments, owner of Commissions

#### Appointment (Sales Activity)
The center of the revenue funnel - every sales call, demo, consultation.

**Purpose**: Tracks sales activity from booking → close, enables commission calculation

**Key Fields**:
- `scheduledAt`, `startTime`, `endTime` - When it happens
- `status` - "booked", "showed", "no_show", "signed", "cancelled"
- `contactId`, `companyId` - Who and which company
- `closerId`, `setterId` - Assignees
- `calendarId` - Links to Calendar for attribution
- `attributionSource`, `leadSource` - Marketing source
- `cashCollected` - Revenue amount
- `saleId` - Links to final Sale
- `ghlAppointmentId` - Sync with GoHighLevel

**Relations**: Belongs to Contact, Company; links to Sale; may have setter/closer

#### Sale (Revenue Event)
A payment received from a customer, matched to an appointment.

**Purpose**: Represents actual money received, triggers commission calculation

**Key Fields**:
- `amount`, `status` - Payment info
- `externalId` - Payment processor ID (unique)
- `processor` - "whop", "stripe", etc.
- `matchedBy` - How it was matched ("appointment_id", "email", "phone", "manual")
- `matchConfidence` - 0.0 to 1.0
- `appointmentId` - Links to Appointment

**Relations**: Has one Commission; links to one Appointment

#### Commission (Earnings)
Calculated earnings for a rep based on a closed sale.

**Purpose**: Tracks earnings, supports progressive releases, enables payout workflows

**Key Fields**:
- `saleId`, `repId`, `companyId` - Relationships
- `percentage`, `totalAmount`, `releasedAmount` - Calculation
- `status` - "pending", "approved", "paid"
- `releaseStatus` - "pending", "partial", "released", "paid"
- `overrideAmount`, `overrideReason` - Manual adjustments

**Key Features**:
- **Progressive Release**: Partial payments release proportional commission
- **Override Support**: Admins can manually adjust
- **State Machine**: pending → approved → paid with audit trail

#### Calendar (Attribution Source)
GoHighLevel calendars synced into the system for attribution tracking.

**Purpose**: Enables calendar-based attribution, links appointments to marketing sources

**Key Fields**:
- `ghlCalendarId` - Sync with GHL
- `trafficSource` - Manually set (e.g., "Facebook", "Google")
- `calendarType` - (e.g., "Setter", "Closer")
- `defaultCloserId` - Auto-assignment

**Relations**: Has many Appointments

#### Contact (Customer)
Person who booked an appointment, the prospect or customer.

**Purpose**: Stores customer data, enables attribution via custom fields and tags

**Key Fields**:
- `name`, `email`, `phone` - Contact info
- `ghlContactId` - Sync with GHL
- `tags` - GHL tags array
- `customFields` - Flexible JSON data (for attribution)

**Relations**: Has many Appointments, Sales

### Database Relationships

```
Company
  ├── User[] (users in company)
  ├── Appointment[] (appointments)
  ├── Contact[] (customers)
  ├── Sale[] (payments)
  ├── Commission[] (earnings)
  ├── Calendar[] (sync'd from GHL)
  ├── CommissionRole[] (role templates)
  └── PaymentLink[] (payment URLs)

User
  ├── Company (belongs to)
  ├── Commission[] (earnings)
  ├── AppointmentsAsCloser[] (appointments as closer)
  ├── AppointmentsAsSetter[] (appointments as setter)
  └── CommissionRole (optional template)

Appointment
  ├── Contact (customer)
  ├── Company (tenant)
  ├── Closer (User)
  ├── Setter (User)
  ├── Sale (if closed)
  ├── Calendar (for attribution)
  └── TrafficSource (optional)

Sale
  ├── Company (tenant)
  ├── Commission (unique)
  ├── Appointment (source)
  ├── Contact (customer)
  ├── User (rep)
  └── PaymentLink (optional)

Commission
  ├── Sale (source)
  ├── User (earner)
  └── Company (tenant)
```

---

## Authentication & Authorization

### Clerk Integration

**Flow**:
1. User signs in via Clerk (`/sign-in`)
2. Clerk redirects to app with JWT
3. Middleware validates JWT
4. App looks up user by `clerkId` in database

### Middleware (`middleware.ts`)

Runs on every request to validate authentication:
```typescript
// Public routes that don't require auth
const isPublic = ['/', '/sign-in', '/sign-up', '/pay']

if (!isPublic) {
  await auth.protect() // Redirects to sign-in if not authenticated
}
```

### User Resolution (`lib/auth.ts`)

#### `getCurrentUser()`: Database Lookup
1. Gets Clerk user ID from session
2. Finds user in database by `clerkId`
3. Auto-creates super admin if first user or special email
4. Returns user object with `id`, `email`, `role`, `companyId`, `superAdmin`, etc.

#### `getEffectiveUser()`: Impersonation Support
1. Checks for impersonation cookie
2. Returns impersonated user if cookie exists, otherwise current user
3. Enables super admins to view app as another user

### Authorization Patterns

**Role Guards**: Functions that check user permissions
```typescript
export async function requireAdmin() {
  const user = await getCurrentUser()
  if (user.role !== 'admin' && !user.superAdmin) {
    redirect('/dashboard')
  }
  return user
}
```

**Permission Checks**: Fine-grained access control
```typescript
export function canViewTeamMetrics(user) {
  return user.role === 'admin' || user.superAdmin || user.canViewTeamMetrics
}
```

### Impersonation Flow

**Super Admin Impersonation**:
1. Admin clicks "Impersonate" on user
2. POST `/api/admin/impersonate` sets `impersonated_user_id` cookie
3. All subsequent requests return impersonated user
4. UI shows banner "Viewing as: John Doe"
5. Exit impersonation clears cookie

**Company Switching**:
- Super admins switch context with `?viewAs=companyId` param
- `CompanySwitcher` component toggles `viewAs` in URL
- All queries filter by `viewAs` instead of `user.companyId`

---

## Core Business Logic

### 1. Appointment-to-Commission Pipeline

**Trigger**: Webhook from payment processor

**Flow**:
```
Payment Received → Sale created → Match to Appointment → 
Determine Commission Rate → Calculate Commission → 
Create Commission record → Update Appointment
```

### Payment Matching (`lib/payment-matcher.ts`)

**Goal**: Link a `Sale` to an `Appointment` to calculate commission

**Strategies** (highest confidence first):
1. **Appointment ID**: 100% confidence (from payment link)
2. **Email Match**: 90% confidence (Contact.email === Sale.customerEmail)
3. **Phone Match**: 85% confidence
4. **Manual Match**: 100% confidence (admin review)

**Unmatched Payments**: If confidence < 0.7, create `UnmatchedPayment` for admin review

### Commission Calculation

**Formula**:
```typescript
const totalCommission = saleAmount * commissionRate

// Progressive release for payment plans
if (paymentAmount < saleAmount) {
  const releasedCommission = totalCommission * (paymentAmount / saleAmount)
  return { totalCommission, releasedCommission }
}

return { totalCommission, releasedCommission: totalCommission }
```

**Example**: $10K sale, 10% rate, $5K payment → $1K total commission, $500 released

### 2. Attribution Resolution

**Purpose**: Determine marketing source for each appointment

**Configurable Strategies** (`lib/attribution.ts`):

**GHL Custom Fields**: Read from Contact.customFields based on configured field path

**Calendar Names**: Extract source from calendar name like "Sales Call (META)" → "META"

**GHL Tags**: Search Contact.tags for source patterns

**Integration**: Triggered automatically when appointment created via GHL webhook

### 3. Setter/Closer Detection

**Trigger**: GHL webhook with appointment data

**Logic**:
1. Priority 1: GHL `assignedUserId` maps to User.ghlUserId
2. Priority 2: Calendar.defaultCloser
3. Priority 3: Calendar name/type inference

**Result**: Appointments always have setter/closer when possible

### 4. Analytics Aggregation

**Dashboard Stats**: Total appointments, show rate, close rate, revenue, by traffic source, by rep

**Rep Dashboard**: Filter to user's appointments as closer/setter

**Leaderboard**: All reps ranked by revenue

---

## API Layer

### Structure

All API routes in `app/api/` directory, grouped by feature:
- `admin/` - Company management
- `rep/` - Rep-specific data
- `analytics/` - Reporting
- `webhooks/` - External integrations
- `super-admin/` - Platform management

### Common Patterns

**Authentication**: Get user, check permissions, return data or error

**Database Access**: Use `withPrisma` helper that auto-disconnects

### Key API Endpoints

**Company Stats**: Get aggregated metrics for company

**Leaderboard**: Get ranked reps by revenue

**Webhooks**: Process external events and sync data

---

## Frontend Architecture

### Route Structure

Protected by `app/(dashboard)/layout.tsx` which provides shared navigation and auth checks

**Pages**:
- `dashboard/` - Main stats and overview
- `analytics/` - Detailed reporting
- `commissions/` - Earnings view
- `leaderboard/` - Team rankings
- `admin/` - Management tools (dropdown)
- `super-admin/` - Platform tools (dropdown)

### Component Architecture

**Server Components**: Fetch data on server, pass to client

**Client Components**: Handle state, effects, interactions

### Navigation

**Role-Based Menu**:
- All users: Dashboard, Analytics, Commissions, Leaderboard
- Admins: + Users, Roles, Payments, Integrations
- Super Admins: + System Overview, All Companies, Monitoring

**Dropdowns**: Cleaner UI, hides complexity until needed

---

## Integrations

### GoHighLevel (GHL)

**Purpose**: Sync appointments and contacts from GHL calendar system

**Setup**: Admin enters API key, system validates and syncs calendars

**Webhook**: Receives appointment events, creates/updates Contact and Appointment

**Calendar Sync**: Manual sync pulls calendars from GHL into database

**GHL Client** (`lib/ghl-api.ts`): 
- Validates API keys
- Fetches calendars, contacts, appointments
- Handles multiple endpoint variations gracefully
- Retry logic for eventual consistency

### Payment Processors (Whop, Stripe)

**Webhook**: Receives payment events, creates Sale, matches to Appointment, calculates commission

**Authentication**: Webhook signature verification

### Clerk (Authentication)

**Webhook**: Syncs user lifecycle events to database

**Events**: `user.created`, `user.deleted`

---

## Workflow & Data Flow

### Rep Login Flow
```
Sign in → JWT validated → Database lookup → 
Fetch stats → Render dashboard
```

### Appointment Booking Flow
```
GHL calendar → GHL webhook → Create Contact/Appointment → 
Assign setter/closer → Resolve attribution → Show in dashboard
```

### Payment & Commission Flow
```
Payment → Processor webhook → Create Sale → 
Match to Appointment → Calculate commission → 
Create Commission → Update Appointment
```

### Attribution Flow
```
Appointment created → Check attribution strategy → 
Extract source → Set Appointment.attributionSource → 
Use in analytics
```

### Super Admin Impersonation Flow
```
Click impersonate → Set cookie → Get impersonated user → 
Filter data by impersonated user → Show banner → 
Exit clears cookie
```

---

## Deployment & Environment

### Environment Variables

Required:
- `DATABASE_URL`, `DIRECT_URL` - Database connections
- `CLERK_*` keys - Authentication
- `NEXT_PUBLIC_APP_URL` - Webhook URLs
- Webhook secrets for integrations

### Deployment (Vercel)

**Process**:
1. Install dependencies
2. Generate Prisma client
3. Build Next.js app
4. Deploy serverless functions

**Structure**: Each `app/api/*/route.ts` becomes a Lambda function

**Database**: Supabase hosted PostgreSQL

**CDN**: Vercel Edge Network

### Database Migrations

**Development**: `npx prisma db push` syncs schema

**Production**: `npx prisma migrate deploy` runs migrations

**Schema Changes**: Edit `schema.prisma` → run migration → Prisma generates types

---

## Summary

PayMaestro is a **multi-tenant appointment-to-commission tracking system** that:

1. **Tracks** appointments from booking to close
2. **Matches** payments to appointments intelligently
3. **Calculates** commissions based on roles and rates
4. **Attributes** marketing sources for ROI analysis
5. **Reports** performance metrics across dashboards
6. **Manages** access with role-based permissions

**Key Technologies**: Next.js 16, Prisma, Clerk, PostgreSQL, Vercel

**Architecture Principles**: Multi-tenancy, API-first, type safety, role-based access, real-time webhooks


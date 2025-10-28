<!-- d46cf595-67fd-4173-bca1-26aa10bd540e 9a4a9847-91f1-4bae-80d9-7cd7919059c9 -->
# Role-Based Dashboard & Impersonation System Improvements

## Current State Analysis

The codebase already has:

- ✅ Impersonation infrastructure (cookies, helpers, banner component)
- ✅ Company stats API endpoint (`/api/admin/company-stats`)
- ✅ Rep stats API endpoint (`/api/rep/stats`)
- ✅ `getEffectiveUser()` helper in `lib/auth.ts`
- ✅ Dashboard client component with role-based rendering
- ✅ Users page with "View As" button
- ✅ Impersonation banner in layout

## Issues to Fix

### 1. API Endpoints Not Respecting Impersonation

**Problem:** API endpoints use `requireAuth()` or `requireAdmin()` instead of `getEffectiveUser()`, so they return the actual logged-in user's data, not the impersonated user's data.

**Files to fix:**

- `/api/admin/company-stats/route.ts` - Line 9: Change `await requireAdmin()` to `await getEffectiveUser()`
- `/api/rep/stats/route.ts` - Line 9: Change `await requireAuth()` to `await getEffectiveUser()`
- `/api/rep/leaderboard/route.ts` - Line 9: Change `await requireAuth()` to `await getEffectiveUser()`
- `/api/analytics/route.ts` - Should use `getEffectiveUser()` for consistency

**Note:** We still need permission checks. After getting effective user, add:

```typescript
const effectiveUser = await getEffectiveUser()
if (!effectiveUser) throw new Error('Unauthorized')
// For admin endpoints, verify they have admin rights:
if (effectiveUser.role !== 'admin' && !effectiveUser.superAdmin) {
  throw new Error('Admin access required')
}
```

### 2. Dashboard Labels Not Role-Specific

**Problem:** The dashboard shows generic labels instead of role-specific text (e.g., "Total Appointments" instead of "Team Appointments" for admins).

**Fix in:** `app/(dashboard)/dashboard/dashboard-client.tsx`

Update metric card labels (lines 124-176):

- Company Admin: "Team Appointments", "Company Revenue", "Team Show Rate", "Team Close Rate"
- Sales Rep: "My Appointments", "My Revenue", "My Show Rate", "My Close Rate"

Update header text (lines 76-82):

- Company Admin: "Company Dashboard" / "Your team's performance overview"
- Sales Rep: "My Dashboard" / "Your personal performance overview"

### 3. Company Stats Showing Commission Metrics

**Problem:** The company-stats endpoint returns commission metrics (lines 156-159) which are individual metrics, not relevant for company-level view.

**Fix:** In `dashboard-client.tsx`, hide the commission tracker section for company admins (it's already checking `!isCompanyAdmin` on line 181, so this is working correctly).

**Optional enhancement:** Remove commission fields from company-stats API response since they're not used.

### 4. Users Page Company Filtering

**Current state:** The `/api/admin/users` endpoint already filters by company for non-super-admins (lines 10-15). The UI shows Company column conditionally (line 303).

**What works:** ✅ Company filtering logic

**What needs improvement:** The Company column only shows if `users.some(u => u.Company)`. This should explicitly check if user is super admin.

**Fix in:** `app/(dashboard)/admin/users/page.tsx`

- Replace line 303 condition with: `{isSuperAdmin && (...)}` 
- Need to pass `isSuperAdmin` prop or fetch from client-side

**Better approach:** Add a client-side effect to check current user's role and conditionally show company column.

## Implementation Steps

### Step 1: Fix API Endpoints to Respect Impersonation

Update these endpoints to use `getEffectiveUser()`:

**File: `/api/admin/company-stats/route.ts`**

- Line 9: Replace `await requireAdmin()` with `await getEffectiveUser()`
- Add permission check after getting user

**File: `/api/rep/stats/route.ts`**

- Line 9: Replace `await requireAuth()` with `await getEffectiveUser()`
- Add null check

**File: `/api/rep/leaderboard/route.ts`**

- Line 9: Replace `await requireAuth()` with `await getEffectiveUser()`
- Add null check

**File: `/api/analytics/route.ts`** (if it exists and uses auth)

- Update to use `getEffectiveUser()`

### Step 2: Update Dashboard Labels Based on Role

**File: `app/(dashboard)/dashboard/dashboard-client.tsx`**

Lines 76-82 (Header):

```typescript
<h1 className="text-3xl font-bold">
  {isCompanyAdmin ? 'Company Dashboard' : 'My Dashboard'}
</h1>
<p className="text-gray-500">
  {isCompanyAdmin ? 'Your team\'s performance overview' : 'Your personal performance overview'}
</p>
```

Lines 124-176 (Metric Cards):

```typescript
<CardTitle className="text-sm font-medium text-gray-600">
  {isCompanyAdmin ? 'Team Appointments' : 'My Appointments'}
</CardTitle>

<CardTitle className="text-sm font-medium text-gray-600">
  {isCompanyAdmin ? 'Team Show Rate' : 'My Show Rate'}
</CardTitle>

<CardTitle className="text-sm font-medium text-gray-600">
  {isCompanyAdmin ? 'Team Close Rate' : 'My Close Rate'}
</CardTitle>

<CardTitle className="text-sm font-medium text-gray-600">
  {isCompanyAdmin ? 'Company Revenue' : 'My Revenue'}
</CardTitle>
```

### Step 3: Improve Users Page Company Column Logic

**File: `app/(dashboard)/admin/users/page.tsx`**

Add effect to detect if current user is super admin:

```typescript
const [isSuperAdmin, setIsSuperAdmin] = useState(false)

useEffect(() => {
  // Check if any user has different company (indicates super admin view)
  const hasMultipleCompanies = new Set(users.map(u => u.Company?.id).filter(Boolean)).size > 1
  setIsSuperAdmin(hasMultipleCompanies || users.some(u => u.Company))
}, [users])
```

Update table header (line 303) and body (line 336) to use `isSuperAdmin` instead of `users.some(u => u.Company)`.

## Testing Checklist

After implementation:

1. **As Company Admin:**

   - [ ] Dashboard shows "Company Dashboard" title
   - [ ] Metrics show "Team Appointments", "Company Revenue", etc.
   - [ ] Stats aggregate all company appointments
   - [ ] No personal commission section visible
   - [ ] Can see "View As" button in Users page
   - [ ] Can impersonate users in their company
   - [ ] Users page shows only company users (no Company column)

2. **As Sales Rep:**

   - [ ] Dashboard shows "My Dashboard" title
   - [ ] Metrics show "My Appointments", "My Revenue", etc.
   - [ ] Stats show only personal appointments
   - [ ] Commission tracker visible with personal earnings
   - [ ] Cannot access Users page
   - [ ] Leaderboard shows with "You" badge

3. **As Super Admin:**

   - [ ] Dashboard shows "Company Dashboard" title (acts as company admin)
   - [ ] Can see ALL users from ALL companies in Users page
   - [ ] Users page shows Company column
   - [ ] Can impersonate any user from any company
   - [ ] When impersonating, sees impersonated user's exact view
   - [ ] Impersonation banner displays correctly
   - [ ] Exit impersonation returns to super admin view

4. **Impersonation Flow:**

   - [ ] Click "View As" on user → redirects to /dashboard
   - [ ] Yellow banner appears with user details
   - [ ] Dashboard shows impersonated user's data
   - [ ] All pages respect impersonated context
   - [ ] Click "Exit Impersonation" → returns to original user
   - [ ] Banner disappears after exit

## Files Modified Summary

1. `/app/api/admin/company-stats/route.ts` - Use getEffectiveUser
2. `/app/api/rep/stats/route.ts` - Use getEffectiveUser
3. `/app/api/rep/leaderboard/route.ts` - Use getEffectiveUser
4. `/app/(dashboard)/dashboard/dashboard-client.tsx` - Update labels
5. `/app/(dashboard)/admin/users/page.tsx` - Fix company column detection

## Priority Notes

The most critical fix is **Step 1** (API endpoints using getEffectiveUser), as this is what makes impersonation actually work. Without this, admins will see their own data instead of the impersonated user's data.

**Step 2** (dashboard labels) is the most visible improvement for the client demo.

**Step 3** (users page) is a minor polish improvement.

### To-dos

- [ ] Update all API endpoints to use getEffectiveUser() instead of requireAuth()/requireAdmin() to respect impersonation context
- [ ] Update dashboard client component to show role-specific labels (Team vs My) for metrics and headers
- [ ] Enhance users page to properly detect super admin and conditionally show company column
- [ ] Test complete impersonation flow for all user roles to verify data isolation and banner functionality
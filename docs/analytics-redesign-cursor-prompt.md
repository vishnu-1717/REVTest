# Analytics Redesign: Drill-Down & Compare Mode Implementation

## 🎯 Project Context

We're enhancing the analytics page at `/app/(dashboard)/analytics/page.tsx` to support **progressive filtering**, **comparison mode**, and **better data exploration**. The goal is to transform the current "flat" analytics view into an interactive exploration tool where users can drill down, compare metrics side-by-side, and discover insights organically.

---

## 📋 Current Codebase Structure

### Existing Files to Modify
- **Main Analytics Page**: `/app/(dashboard)/analytics/page.tsx` (1,068 LOC)
- **Analytics API**: `/app/api/analytics/route.ts` (1,567 LOC)
- **Filter Component**: `/components/AdvancedFilters.tsx` (325 LOC)
- **Types**: `/types/stats.ts`, `/types/appointments.ts`

### Tech Stack
- **Framework**: Next.js 16 (App Router), React 19
- **UI**: Tailwind CSS 4 + Shadcn UI (Radix primitives)
- **Database**: Prisma with PostgreSQL
- **State**: React hooks (useState, useEffect, useCallback)
- **Auth**: Clerk

### Current Patterns
- **Filtering**: URL params → API call → in-memory aggregation
- **Aggregation**: JavaScript reduce() on fetched appointments
- **Drill-down**: Modal with detailed appointment list
- **No charting library** currently installed

---

## 🎨 Design Vision

### Core User Flows

#### Flow 1: Progressive Filtering
```
User clicks "Friday" in day breakdown
  ↓
Add [Friday ×] chip to context bar
  ↓
Re-fetch analytics with dayOfWeek=5 filter
  ↓
All metrics recalculate to show ONLY Friday data
  ↓
User clicks "DM Setter" calendar
  ↓
Add [DM Setter ×] chip, now filtering by both
  ↓
Continue drilling down...
```

#### Flow 2: Comparison Mode
```
User filters to "Friday DM Sets"
  ↓
Toggle "Compare Mode" ON
  ↓
UI splits into two columns
  ↓
Left: Friday DM Sets (current filter)
Right: Comparison target (selectable: "All Other Days", "Weekdays", "Email Leads", etc.)
  ↓
Both datasets show side-by-side metrics
  ↓
Automatic insights: "Friday shows 8% better, closes 12% worse"
```

#### Flow 3: Multi-Select Compare
```
User checks [✓] "DM Setter" calendar
User checks [✓] "Email Triage" calendar
  ↓
Click "Compare Selected"
  ↓
Split view shows both calendars side-by-side
  ↓
Comparison metrics with color-coded differences
```

---

## 🏗️ Architecture Changes

### Phase 1: Core Filtering with Context Bar

**New Components to Create:**

1. **`/components/analytics/FilterContextBar.tsx`**
   - Displays active filters as removable chips
   - Shows current data scope ("Showing: 47 appointments")
   - "Clear All" and "Compare Mode" toggle
   - Props: `filters`, `onRemoveFilter`, `onClearAll`, `compareMode`, `onToggleCompare`, `appointmentCount`

2. **`/components/analytics/FilterChip.tsx`**
   - Individual filter chip with × button
   - Props: `label`, `onRemove`, `color?`
   - Example: `<FilterChip label="Friday" onRemove={() => handleRemove('dayOfWeek')} />`

3. **`/components/analytics/ClickableMetricCard.tsx`**
   - Enhanced version of current metric cards
   - Add click handler to drill down OR add as filter
   - Visual hover state (border highlight)
   - Props: `title`, `value`, `status`, `onClick`, `filterKey?`, `filterValue?`

**Modifications to Existing Files:**

**`/app/(dashboard)/analytics/page.tsx`**
```typescript
// Add new state
const [filterChips, setFilterChips] = useState<FilterChip[]>([])
const [compareMode, setCompareMode] = useState(false)
const [comparisonTarget, setComparisonTarget] = useState<'all_other_days' | 'weekdays' | null>(null)

// New function: Add filter from clicking a metric
const handleAddFilter = (key: string, value: any, label: string) => {
  setFilters(prev => ({ ...prev, [key]: value }))
  setFilterChips(prev => [...prev, { key, value, label }])
  fetchAnalytics({ ...filters, [key]: value })
}

// New function: Remove filter chip
const handleRemoveFilter = (key: string) => {
  const newFilters = { ...filters }
  delete newFilters[key]
  setFilters(newFilters)
  setFilterChips(prev => prev.filter(chip => chip.key !== key))
  fetchAnalytics(newFilters)
}

// Render FilterContextBar above metrics
return (
  <div>
    <FilterContextBar
      filters={filterChips}
      onRemoveFilter={handleRemoveFilter}
      onClearAll={() => { setFilters({}); setFilterChips([]); fetchAnalytics({}) }}
      compareMode={compareMode}
      onToggleCompare={() => setCompareMode(!compareMode)}
      appointmentCount={analytics?.scheduledCallsToDate || 0}
    />
    {/* Rest of analytics UI */}
  </div>
)
```

**UI Layout Update:**
```jsx
{/* Add context bar at top */}
<FilterContextBar {...contextBarProps} />

{/* Keep existing advanced filters but make collapsible */}
<Collapsible>
  <CollapsibleTrigger>
    <Button variant="outline">Advanced Filters ▼</Button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <AdvancedFilters {...existingProps} />
  </CollapsibleContent>
</Collapsible>

{/* Make metric cards clickable */}
<div className="grid gap-4 md:grid-cols-4">
  <ClickableMetricCard
    title="Show Rate"
    value={`${analytics.showRate.toFixed(1)}%`}
    status={getKpiStatus(analytics.showRate, 75)} // Green if >75%
    onClick={() => handleDrillDown('show_rate')}
  />
  {/* ... more cards */}
</div>

{/* Make breakdown cards clickable to add filters */}
<Card>
  <CardHeader>By Day of Week</CardHeader>
  <CardContent>
    {analytics.byDayOfWeek.map(day => (
      <div
        key={day.dayOfWeek}
        className="cursor-pointer hover:bg-accent p-2 rounded"
        onClick={() => handleAddFilter('dayOfWeek', day.dayOfWeek, dayNames[day.dayOfWeek])}
      >
        <span>{dayNames[day.dayOfWeek]}</span>
        <span className={getKpiColorClass(day.showRate, 75)}>{day.showRate}%</span>
      </div>
    ))}
  </CardContent>
</Card>
```

---

### Phase 2: Comparison Mode

**New Components:**

1. **`/components/analytics/ComparisonView.tsx`**
   - Split-screen layout with two data columns
   - Props: `primaryData`, `comparisonData`, `comparisonLabel`
   - Renders metrics side-by-side with diff indicators (▲ +8% green, ▼ -12% red)

2. **`/components/analytics/ComparisonTargetSelector.tsx`**
   - Dropdown to select what to compare against
   - Options: "All Other Days", "Weekdays Only", "Weekends Only", "Previous Period", "Custom Filter"
   - Props: `value`, `onChange`, `currentFilters`

**API Enhancement:**

**`/app/api/analytics/route.ts`**
```typescript
// Add new query parameter: compareWith
// Examples:
//   ?compareWith=all_other_days (exclude current dayOfWeek filter)
//   ?compareWith=previous_period (same date range, offset by period length)
//   ?compareWith=calendar:Email%20Triage (specific comparison target)

// In GET handler:
const compareWith = searchParams.get('compareWith')
if (compareWith) {
  // Fetch two datasets:
  // 1. Primary dataset (with all filters)
  // 2. Comparison dataset (with compareWith modifications)

  const primaryData = await aggregateAnalytics(filters)
  const comparisonData = await aggregateAnalytics(getComparisonFilters(filters, compareWith))

  return NextResponse.json({
    primary: primaryData,
    comparison: comparisonData,
    insights: generateInsights(primaryData, comparisonData)
  })
}
```

**`/app/(dashboard)/analytics/page.tsx` Update:**
```typescript
// When compareMode is ON
const [comparisonData, setComparisonData] = useState(null)

useEffect(() => {
  if (compareMode && comparisonTarget) {
    fetchAnalytics({ ...filters, compareWith: comparisonTarget })
      .then(res => setComparisonData(res.comparison))
  }
}, [compareMode, comparisonTarget])

// Conditional render
{compareMode ? (
  <ComparisonView
    primaryData={analytics}
    comparisonData={comparisonData}
    comparisonLabel={getComparisonLabel(comparisonTarget)}
  />
) : (
  <StandardAnalyticsView data={analytics} />
)}
```

**Comparison Metrics Display:**
```jsx
<div className="grid grid-cols-2 gap-8">
  {/* LEFT: Current Filter */}
  <div className="border-r pr-8">
    <h3 className="font-semibold mb-4">
      {filterChips.length > 0 ? filterChips.map(c => c.label).join(' + ') : 'All Data'}
    </h3>
    <MetricsList data={analytics} />
  </div>

  {/* RIGHT: Comparison */}
  <div className="pl-8">
    <h3 className="font-semibold mb-4 flex items-center gap-2">
      <ComparisonTargetSelector
        value={comparisonTarget}
        onChange={setComparisonTarget}
      />
    </h3>
    <MetricsList data={comparisonData} />
  </div>

  {/* INSIGHTS PANEL BELOW */}
  <div className="col-span-2 mt-8 p-4 bg-blue-50 rounded-lg">
    <h4 className="font-semibold mb-2">💡 Insights</h4>
    <ul className="space-y-2">
      {insights.map(insight => (
        <li key={insight.id} className="flex items-start gap-2">
          <span className={insight.sentiment === 'positive' ? 'text-green-600' : 'text-red-600'}>
            {insight.sentiment === 'positive' ? '✅' : '⚠️'}
          </span>
          <span>{insight.message}</span>
        </li>
      ))}
    </ul>
  </div>
</div>
```

---

### Phase 3: KPI Coloring & Visual Intelligence

**New Utility File:**

**`/lib/analytics-kpi.ts`**
```typescript
export interface KPITarget {
  showRate: number         // Default: 75%
  closeRate: number        // Default: 50%
  maxLeadTimeDays: number  // Default: 3
  qualifiedRate: number    // Default: 80%
}

export function getKpiStatus(
  value: number,
  target: number,
  tolerance: number = 0.1  // 10% tolerance
): 'success' | 'warning' | 'danger' {
  if (value >= target) return 'success'
  if (value >= target * (1 - tolerance)) return 'warning'
  return 'danger'
}

export function getKpiColorClass(status: 'success' | 'warning' | 'danger'): string {
  return {
    success: 'text-green-600 bg-green-50',
    warning: 'text-yellow-600 bg-yellow-50',
    danger: 'text-red-600 bg-red-50'
  }[status]
}

export function getKpiBadge(value: number, target: number): string {
  const status = getKpiStatus(value, target)
  return {
    success: '✅',
    warning: '🟡',
    danger: '🔴'
  }[status]
}
```

**Update all metric displays:**
```tsx
<div className={cn(
  "p-4 rounded-lg",
  getKpiColorClass(getKpiStatus(analytics.showRate, 75))
)}>
  <div className="text-2xl font-bold">
    {analytics.showRate.toFixed(1)}% {getKpiBadge(analytics.showRate, 75)}
  </div>
  <div className="text-sm text-muted-foreground">Show Rate</div>
</div>
```

---

### Phase 4: Advanced Interactions

**Multi-Select Compare:**

**`/components/analytics/BreakdownTable.tsx`**
```tsx
// Add checkboxes to calendar/closer tables
const [selectedItems, setSelectedItems] = useState<string[]>([])

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>
        <Checkbox
          checked={selectedItems.length === items.length}
          onCheckedChange={handleSelectAll}
        />
      </TableHead>
      <TableHead>Calendar</TableHead>
      {/* ... other columns */}
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map(item => (
      <TableRow key={item.id}>
        <TableCell>
          <Checkbox
            checked={selectedItems.includes(item.id)}
            onCheckedChange={() => handleToggleSelect(item.id)}
          />
        </TableCell>
        <TableCell>{item.name}</TableCell>
        {/* ... */}
      </TableRow>
    ))}
  </TableBody>
</Table>

{selectedItems.length > 1 && (
  <Button onClick={() => handleCompareSelected(selectedItems)}>
    Compare Selected ({selectedItems.length})
  </Button>
)}
```

**Sortable Tables:**
```tsx
const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>()

const handleSort = (key: string) => {
  setSortConfig(prev => ({
    key,
    direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
  }))
}

const sortedData = useMemo(() => {
  if (!sortConfig) return data
  return [...data].sort((a, b) => {
    const aVal = a[sortConfig.key]
    const bVal = b[sortConfig.key]
    const modifier = sortConfig.direction === 'asc' ? 1 : -1
    return aVal > bVal ? modifier : -modifier
  })
}, [data, sortConfig])

<TableHead
  className="cursor-pointer hover:bg-accent"
  onClick={() => handleSort('showRate')}
>
  Show Rate {sortConfig?.key === 'showRate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
</TableHead>
```

---

## 🚀 Implementation Checklist

### Phase 1: Core Filtering (Week 1)
- [ ] Create `FilterContextBar` component
- [ ] Create `FilterChip` component
- [ ] Add `filterChips` state to analytics page
- [ ] Implement `handleAddFilter` for clickable metrics
- [ ] Implement `handleRemoveFilter` for chip removal
- [ ] Make day-of-week breakdown clickable
- [ ] Make calendar breakdown clickable
- [ ] Make closer breakdown clickable
- [ ] Update URL params to reflect active filters
- [ ] Add KPI color coding utilities (`lib/analytics-kpi.ts`)
- [ ] Apply color coding to all metrics

### Phase 2: Comparison Mode (Week 2)
- [ ] Add `compareWith` query param support to API route
- [ ] Create comparison filter logic (all other days, previous period, etc.)
- [ ] Create `ComparisonView` component
- [ ] Create `ComparisonTargetSelector` component
- [ ] Add compare mode toggle to context bar
- [ ] Implement side-by-side metric display
- [ ] Add diff indicators (▲/▼ with percentages)
- [ ] Generate automatic insights from comparisons
- [ ] Create insights display panel

### Phase 3: Enhanced Tables (Week 3)
- [ ] Add sorting to all breakdown tables
- [ ] Add checkboxes for multi-select compare
- [ ] Implement "Compare Selected" flow
- [ ] Add table export functionality (CSV)
- [ ] Add pagination for large datasets
- [ ] Add search/filter within tables

### Phase 4: Charting (Week 4)
- [ ] Install charting library (`npm install recharts`)
- [ ] Create time-series line chart component for trend analysis
- [ ] Create bar chart for day-of-week comparison
- [ ] Create stacked bar for calendar performance
- [ ] Add chart/table toggle for all breakdowns
- [ ] Make charts interactive (click bar → add filter)

### Phase 5: Views & Presets (Week 5)
- [ ] Design view schema (save filters + layout preferences)
- [ ] Create "Save as View" functionality
- [ ] Create View tabs (Overview, Booking, Closer Performance, etc.)
- [ ] Store views in localStorage or database
- [ ] Create preset views for common questions
- [ ] Add view sharing (URL with encoded filters)

---

## 🎨 Design Patterns to Follow

### 1. Consistent Hover States
```tsx
className="cursor-pointer hover:bg-accent hover:border-primary transition-colors rounded-lg p-4"
```

### 2. Loading States
```tsx
{loading ? (
  <div className="flex items-center justify-center p-12">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
) : (
  <AnalyticsContent />
)}
```

### 3. Empty States
```tsx
{analytics?.scheduledCallsToDate === 0 && (
  <div className="text-center p-12 text-muted-foreground">
    <CalendarX className="h-12 w-12 mx-auto mb-4 opacity-50" />
    <p className="text-lg font-semibold">No appointments found</p>
    <p className="text-sm">Try adjusting your filters</p>
  </div>
)}
```

### 4. Smooth Transitions
```tsx
// Use Framer Motion for smooth filtering animations
import { motion, AnimatePresence } from 'framer-motion'

<AnimatePresence>
  {filterChips.map(chip => (
    <motion.div
      key={chip.key}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      <FilterChip {...chip} />
    </motion.div>
  ))}
</AnimatePresence>
```

---

## 📊 Example API Response Structure

```typescript
// GET /api/analytics?dateFrom=2025-11-01&dateTo=2025-11-12&compareWith=all_other_days

{
  "primary": {
    "callsCreated": 142,
    "scheduledCallsToDate": 128,
    "showRate": 73.2,
    "closeRate": 44.1,
    "averageLeadTimeDays": 2.8,
    "byCloser": [...],
    "byDayOfWeek": [...],
    "byCalendar": [...]
  },
  "comparison": {
    // Same structure but with comparison data
  },
  "insights": [
    {
      "id": "lead-time-correlation",
      "message": "Shorter lead time (2.8d vs 4.5d) correlates with 8% higher show rate",
      "sentiment": "positive",
      "metric": "leadTime",
      "difference": -1.7
    },
    {
      "id": "close-rate-drop",
      "message": "Close rate is 6% lower than comparison period - investigate objections",
      "sentiment": "negative",
      "metric": "closeRate",
      "difference": -6.2
    }
  ],
  "meta": {
    "primaryFilters": { "dateFrom": "2025-11-01", "dateTo": "2025-11-12" },
    "comparisonFilters": { "dateFrom": "2025-10-01", "dateTo": "2025-10-31" },
    "totalRecords": 128
  }
}
```

---

## 🎯 Key Questions Answered by New UI

| User Question | How to Answer |
|--------------|---------------|
| Which closer is best at DM sets on Fridays? | 1. Click "Friday" → 2. Click "DM Setter" → 3. Sort closer table by close rate |
| What's our optimal booking window? | View "Booking" tab → See lead time chart → Recommendation shows < 3 days optimal |
| Why did show rate drop? | Compare Mode: This Week vs Last Week → Insights panel shows cause |
| Which calendar has the best ROI? | Calendar breakdown → Sort by close rate → Compare top 2 calendars |
| Are follow-ups converting better than first calls? | Click "Follow Up" in appointment type → Compare to "First Call" |

---

## 🔧 Utilities to Create

### `/lib/analytics-insights.ts`
```typescript
export function generateInsights(
  primary: AnalyticsResponse,
  comparison: AnalyticsResponse
): Insight[] {
  const insights: Insight[] = []

  // Lead time correlation
  if (primary.averageAppointmentLeadTimeDays < comparison.averageAppointmentLeadTimeDays) {
    const leadTimeDiff = comparison.averageAppointmentLeadTimeDays - primary.averageAppointmentLeadTimeDays
    const showRateDiff = primary.showRate - comparison.showRate
    if (showRateDiff > 5) {
      insights.push({
        id: 'lead-time-show-rate',
        message: `Shorter lead time (${primary.averageAppointmentLeadTimeDays.toFixed(1)}d vs ${comparison.averageAppointmentLeadTimeDays.toFixed(1)}d) correlates with ${showRateDiff.toFixed(1)}% higher show rate`,
        sentiment: 'positive',
        metric: 'leadTime'
      })
    }
  }

  // Close rate changes
  const closeRateDiff = primary.closeRate - comparison.closeRate
  if (Math.abs(closeRateDiff) > 5) {
    insights.push({
      id: 'close-rate-change',
      message: `Close rate is ${Math.abs(closeRateDiff).toFixed(1)}% ${closeRateDiff > 0 ? 'higher' : 'lower'} than comparison`,
      sentiment: closeRateDiff > 0 ? 'positive' : 'negative',
      metric: 'closeRate',
      difference: closeRateDiff
    })
  }

  return insights
}
```

### `/lib/analytics-comparison.ts`
```typescript
export function getComparisonFilters(
  baseFilters: FilterState,
  compareWith: string
): FilterState {
  switch (compareWith) {
    case 'all_other_days':
      // If filtering by dayOfWeek=5 (Friday), compare to days != 5
      return { ...baseFilters, dayOfWeek: undefined, excludeDayOfWeek: baseFilters.dayOfWeek }

    case 'previous_period':
      const start = new Date(baseFilters.dateFrom)
      const end = new Date(baseFilters.dateTo)
      const duration = end - start
      return {
        ...baseFilters,
        dateFrom: new Date(start - duration).toISOString(),
        dateTo: baseFilters.dateFrom
      }

    case 'weekdays':
      return { ...baseFilters, dayOfWeek: [1,2,3,4,5] }

    case 'weekends':
      return { ...baseFilters, dayOfWeek: [0,6] }

    default:
      return baseFilters
  }
}
```

---

## 💡 Pro Tips

1. **Start with Filter Chips**: This is the foundation that makes everything else work
2. **Keep URL in Sync**: Update `window.history.pushState` when filters change for shareable links
3. **Debounce API Calls**: Don't fetch on every keystroke, wait 300ms
4. **Cache Results**: Store recent filter combinations in `useMemo` to avoid re-fetching
5. **Progressive Enhancement**: Start with basic click-to-filter, then add fancy transitions
6. **Mobile First**: Design for mobile viewport, then enhance for desktop
7. **Performance**: If dataset > 10k appointments, show warning and suggest narrower date range

---

## 🎨 Color Palette (KPI Status)

```typescript
// Tailwind classes
const colors = {
  success: {
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800'
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-800'
  },
  danger: {
    bg: 'bg-red-50 dark:bg-red-950',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800'
  }
}
```

---

## 🚦 Success Criteria

This implementation is successful when:

1. ✅ Users can answer "Which X performs best on Y?" in < 5 clicks
2. ✅ Any metric can be compared to any other metric
3. ✅ Active filters are always visible in context bar
4. ✅ All breakdowns are clickable to add filters
5. ✅ Comparison mode works smoothly with automatic insights
6. ✅ KPI colors instantly show what's good/bad
7. ✅ No page refreshes needed (SPA behavior)
8. ✅ URL reflects current view (shareable links)
9. ✅ Mobile-responsive design
10. ✅ Performance stays fast even with filters

---

## 🎬 Getting Started

**Immediate Next Steps:**

1. Start with Phase 1, Task 1: Create `FilterContextBar` component
2. Wire it up to existing analytics page state
3. Make one breakdown clickable (start with day-of-week)
4. Test the flow: Click Friday → See filter chip → All metrics update
5. Once that works, repeat for other breakdowns
6. Then move to comparison mode

**First Component to Build:**

```bash
# Create the file
touch /home/user/saas/components/analytics/FilterContextBar.tsx

# Paste starter code:
```

```tsx
'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface FilterChip {
  key: string
  value: any
  label: string
}

interface FilterContextBarProps {
  filters: FilterChip[]
  onRemoveFilter: (key: string) => void
  onClearAll: () => void
  compareMode: boolean
  onToggleCompare: () => void
  appointmentCount: number
}

export function FilterContextBar({
  filters,
  onRemoveFilter,
  onClearAll,
  compareMode,
  onToggleCompare,
  appointmentCount
}: FilterContextBarProps) {
  return (
    <div className="bg-muted/50 rounded-lg p-4 mb-6 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            🔍 Current Filter Context:
          </span>
          <Badge variant="secondary">
            Showing: {appointmentCount} appointments
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          {/* Compare Mode Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="compare-mode"
              checked={compareMode}
              onCheckedChange={onToggleCompare}
            />
            <Label htmlFor="compare-mode" className="text-sm cursor-pointer">
              Compare Mode
            </Label>
          </div>

          {/* Clear All */}
          {filters.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
            >
              Clear All Filters
            </Button>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map(filter => (
            <Badge
              key={filter.key}
              variant="default"
              className="pl-3 pr-2 py-1 gap-1 cursor-pointer hover:bg-primary/80 transition-colors"
            >
              <span>{filter.label}</span>
              <button
                onClick={() => onRemoveFilter(filter.key)}
                className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Empty State */}
      {filters.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No filters applied. Click any metric to start exploring.
        </p>
      )}
    </div>
  )
}
```

**Wire it into analytics page:**

```tsx
// In /app/(dashboard)/analytics/page.tsx

import { FilterContextBar } from '@/components/analytics/FilterContextBar'

// Add state
const [filterChips, setFilterChips] = useState<FilterChip[]>([])
const [compareMode, setCompareMode] = useState(false)

// Add to render (after header, before filters):
<FilterContextBar
  filters={filterChips}
  onRemoveFilter={(key) => {
    const newFilters = { ...filters }
    delete newFilters[key]
    setFilters(newFilters)
    setFilterChips(prev => prev.filter(c => c.key !== key))
    fetchAnalytics(newFilters)
  }}
  onClearAll={() => {
    setFilters({})
    setFilterChips([])
    fetchAnalytics({})
  }}
  compareMode={compareMode}
  onToggleCompare={() => setCompareMode(!compareMode)}
  appointmentCount={analytics?.scheduledCallsToDate || 0}
/>
```

Now test it! You should see the filter context bar render. Next step: make something clickable to add a filter chip.

---

**You now have a complete blueprint to transform your analytics page into an interactive exploration tool. Start with Phase 1 and build incrementally. Each phase adds value independently, so you can ship early and often.**

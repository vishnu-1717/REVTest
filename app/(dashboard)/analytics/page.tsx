'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import AdvancedFilters from '@/components/AdvancedFilters'
import {
  FilterContextBar,
  type FilterChip as AnalyticsFilterChip
} from '@/components/analytics/FilterContextBar'
import { ClickableMetricCard } from '@/components/analytics/ClickableMetricCard'
import { cn } from '@/lib/utils'
import { getKpiBadge, getKpiColorClass, getKpiStatus, resolveTarget } from '@/lib/analytics-kpi'

interface FilterState {
  dateFrom: string
  dateTo: string
  closer: string
  status: string
  dayOfWeek: string
  objectionType: string
  appointmentType: string
  followUpNeeded: string
  nurtureType: string
  minDealSize: string
  maxDealSize: string
  calendar: string
  timeOfDay: string
}

type QuickViewRange =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_month'
  | 'this_year'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const STATUS_LABELS: Record<string, string> = {
  signed: 'Signed',
  showed: 'Showed',
  no_show: 'No Show',
  cancelled: 'Cancelled',
  scheduled: 'Scheduled'
}

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  first_call: 'First Call',
  follow_up: 'Follow Up'
}

const TIME_OF_DAY_LABELS: Record<string, string> = {
  morning: 'Morning (6am-12pm)',
  afternoon: 'Afternoon (12pm-5pm)',
  evening: 'Evening (5pm-9pm)',
  night: 'Night (9pm-6am)'
}

const FOLLOW_UP_LABELS: Record<string, string> = {
  true: 'Follow-ups Needed',
  false: 'No Follow-ups Needed'
}

const parseNumericValue = (value: unknown): number => {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  return NaN
}

const formatPercentValue = (value: unknown): string => {
  const numeric = parseNumericValue(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  return `${numeric.toFixed(1)}%`
}

const formatCurrencyValue = (value: unknown, fractionDigits = 0): string => {
  const numeric = parseNumericValue(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })
}

const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfWeek = (date: Date): Date => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = start.getDay()
  const diff = (day + 6) % 7 // Treat Monday as start of week
  start.setDate(start.getDate() - diff)
  return start
}

const endOfWeek = (start: Date): Date => {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

const startOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

const startOfYear = (date: Date): Date => {
  return new Date(date.getFullYear(), 0, 1)
}

const createDefaultFilters = (): FilterState => {
  const today = new Date()
  return {
    dateFrom: formatDate(startOfMonth(today)),
    dateTo: formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate())),
    closer: '',
    status: '',
    dayOfWeek: '',
    objectionType: '',
    appointmentType: '',
    followUpNeeded: '',
    nurtureType: '',
    minDealSize: '',
    maxDealSize: '',
    calendar: '',
    timeOfDay: ''
  }
}

const computeQuickViewRange = (range: QuickViewRange) => {
  const today = new Date()
  const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  switch (range) {
    case 'today': {
      return {
        from: formatDate(todayAtMidnight),
        to: formatDate(todayAtMidnight)
      }
    }
    case 'yesterday': {
      const yesterday = new Date(todayAtMidnight)
      yesterday.setDate(yesterday.getDate() - 1)
      return {
        from: formatDate(yesterday),
        to: formatDate(yesterday)
      }
    }
    case 'this_week': {
      const weekStart = startOfWeek(todayAtMidnight)
      return {
        from: formatDate(weekStart),
        to: formatDate(todayAtMidnight)
      }
    }
    case 'last_week': {
      const thisWeekStart = startOfWeek(todayAtMidnight)
      const lastWeekStart = new Date(thisWeekStart)
      lastWeekStart.setDate(lastWeekStart.getDate() - 7)
      const lastWeekEnd = endOfWeek(lastWeekStart)
      return {
        from: formatDate(lastWeekStart),
        to: formatDate(lastWeekEnd)
      }
    }
    case 'last_month': {
      const firstOfThisMonth = startOfMonth(todayAtMidnight)
      const lastMonthEnd = new Date(firstOfThisMonth)
      lastMonthEnd.setDate(0)
      const lastMonthStart = startOfMonth(lastMonthEnd)
      return {
        from: formatDate(lastMonthStart),
        to: formatDate(lastMonthEnd)
      }
    }
    case 'this_year': {
      const yearStart = startOfYear(todayAtMidnight)
      return {
        from: formatDate(yearStart),
        to: formatDate(todayAtMidnight)
      }
    }
  }
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters())
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters())
  const [compareMode, setCompareMode] = useState(false)

  const [analytics, setAnalytics] = useState<any>(null)
  const [closers, setClosers] = useState<any[]>([])
  const [calendars, setCalendars] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [activeView, setActiveView] = useState<'overview' | 'closers' | 'calendars' | 'objections'>('overview')
  const [timezone, setTimezone] = useState('UTC')
  const [activeQuickView, setActiveQuickView] = useState<QuickViewRange | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailTitle, setDetailTitle] = useState('')
  const [detailMetricKey, setDetailMetricKey] = useState<string | null>(null)
  const [detailItems, setDetailItems] = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)


  const generateFilterChips = useCallback(
    (state: FilterState): AnalyticsFilterChip[] => {
      const chips: AnalyticsFilterChip[] = []

      const addChip = (key: keyof FilterState, value: string, label: string) => {
        if (!value) return
        chips.push({
          key,
          value,
          label
        })
      }

      if (state.dayOfWeek) {
        const dayIndex = Number(state.dayOfWeek)
        const dayLabel = Number.isNaN(dayIndex) ? `Day ${state.dayOfWeek}` : DAY_NAMES[dayIndex] ?? `Day ${state.dayOfWeek}`
        addChip('dayOfWeek', state.dayOfWeek, dayLabel)
      }

      if (state.status) {
        addChip('status', state.status, STATUS_LABELS[state.status] ?? state.status)
      }

      if (state.closer) {
        const closerLabel =
          closers.find((closer) => closer.id === state.closer)?.name || 'Selected Closer'
        addChip('closer', state.closer, closerLabel)
      }

      if (state.calendar) {
        addChip('calendar', state.calendar, state.calendar)
      }

      if (state.timeOfDay) {
        addChip('timeOfDay', state.timeOfDay, TIME_OF_DAY_LABELS[state.timeOfDay] ?? state.timeOfDay)
      }

      if (state.appointmentType) {
        addChip(
          'appointmentType',
          state.appointmentType,
          APPOINTMENT_TYPE_LABELS[state.appointmentType] ?? state.appointmentType
        )
      }

      if (state.objectionType) {
        addChip('objectionType', state.objectionType, state.objectionType)
      }

      if (state.followUpNeeded) {
        addChip(
          'followUpNeeded',
          state.followUpNeeded,
          FOLLOW_UP_LABELS[state.followUpNeeded] ?? 'Follow-up Filter'
        )
      }

      if (state.nurtureType) {
        addChip('nurtureType', state.nurtureType, state.nurtureType)
      }

      if (state.minDealSize) {
        const minLabel = Number.isNaN(Number(state.minDealSize))
          ? `Min Deal ≥ ${state.minDealSize}`
          : `Min Deal ≥ $${Number(state.minDealSize).toLocaleString()}`
        addChip('minDealSize', state.minDealSize, minLabel)
      }

      if (state.maxDealSize) {
        const maxLabel = Number.isNaN(Number(state.maxDealSize))
          ? `Max Deal ≤ ${state.maxDealSize}`
          : `Max Deal ≤ $${Number(state.maxDealSize).toLocaleString()}`
        addChip('maxDealSize', state.maxDealSize, maxLabel)
      }

      return chips
    },
    [closers]
  )

  const filterChips = useMemo(
    () => generateFilterChips(filters),
    [filters, generateFilterChips]
  )

  const parseFiltersFromUrl = useCallback((): FilterState | null => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const nextFilters = createDefaultFilters()
    let hasFilters = false

    ;(Object.keys(nextFilters) as Array<keyof FilterState>).forEach((key) => {
      const value = params.get(key)
      if (value) {
        nextFilters[key] = value
        hasFilters = true
      }
    })

    return hasFilters ? nextFilters : null
  }, [])

  const updateUrlFromFilters = useCallback((state: FilterState) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams()
    ;(Object.entries(state) as Array<[keyof FilterState, string]>).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      }
    })

    const currentUrl = new URL(window.location.href)
    const viewAs = currentUrl.searchParams.get('viewAs')
    if (viewAs) {
      params.set('viewAs', viewAs)
    }

    const newSearch = params.toString()
    const newUrl = `${currentUrl.pathname}${newSearch ? `?${newSearch}` : ''}`
    window.history.replaceState({}, '', newUrl)
  }, [])

  const appendViewAs = useCallback((url: string) => {
    if (typeof window === 'undefined') return url
    const params = new URLSearchParams(window.location.search)
    const viewAs = params.get('viewAs')
    if (!viewAs) return url
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}viewAs=${viewAs}`
  }, [])
  
  useEffect(() => {
    fetchClosers()
    const urlFilters = parseFiltersFromUrl()
    if (urlFilters) {
      setFilters(urlFilters)
      setDraftFilters(urlFilters)
      fetchAnalytics(urlFilters)
    } else {
      fetchAnalytics()
    }
  }, [parseFiltersFromUrl])
  
  const fetchClosers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        credentials: 'include'
      })
      const data = await res.json()
      setClosers(data)
      
      // Extract unique calendars from appointments (you'd want a dedicated endpoint)
      // For now, we'll populate this when we get analytics data
    } catch (error) {
      console.error('Failed to fetch closers:', error)
    }
  }
  
  const fetchAnalytics = async (overrideFilters?: FilterState) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const filtersToUse = overrideFilters ?? filters

      Object.entries(filtersToUse).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      
      // Include viewAs parameter from current URL if present
      const urlParams = new URLSearchParams(window.location.search)
      const viewAs = urlParams.get('viewAs')
      if (viewAs) {
        params.append('viewAs', viewAs)
      }
      
      const res = await fetch(`/api/analytics?${params}`, {
        credentials: 'include'
      })
      const data = await res.json()
      setAnalytics(data)
      if (data.timezone) {
        setTimezone(data.timezone)
      }
      
      // Extract unique calendars
      if (data.byCalendar) {
        setCalendars(data.byCalendar.map((c: any) => c.calendar))
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    }
    setLoading(false)
  }
  
  const handleApplyFilters = () => {
    setActiveQuickView(null)
    const appliedFilters = { ...draftFilters }
    setFilters(appliedFilters)
    updateUrlFromFilters(appliedFilters)
    fetchAnalytics(appliedFilters)
  }

  const handleFilterChange = (nextFilters: FilterState) => {
    setActiveQuickView(null)
    setDraftFilters(nextFilters)
  }

  const handleAddFilter = (key: keyof FilterState, value: string) => {
    if (!value) return
    const updatedFilters: FilterState = {
      ...filters,
      [key]: value
    }

    setFilters(updatedFilters)
    setDraftFilters(updatedFilters)
    setActiveQuickView(null)
    updateUrlFromFilters(updatedFilters)
    fetchAnalytics(updatedFilters)
  }

  const handleQuickView = (range: QuickViewRange) => {
    const computed = computeQuickViewRange(range)
    if (!computed) return

    const updatedFilters: FilterState = {
      ...filters,
      dateFrom: computed.from,
      dateTo: computed.to
    }

    setFilters(updatedFilters)
    setDraftFilters(updatedFilters)
    setActiveQuickView(range)
    updateUrlFromFilters(updatedFilters)
    fetchAnalytics(updatedFilters)
  }

  const handleRemoveFilter = (key: keyof FilterState) => {
    const updatedFilters: FilterState = {
      ...filters,
      [key]: ''
    }

    setFilters(updatedFilters)
    setDraftFilters(updatedFilters)
    setActiveQuickView(null)
    updateUrlFromFilters(updatedFilters)
    fetchAnalytics(updatedFilters)
  }

  const handleClearAllFilters = () => {
    const defaultFilters = createDefaultFilters()
    setFilters(defaultFilters)
    setDraftFilters(defaultFilters)
    setActiveQuickView(null)
    updateUrlFromFilters(defaultFilters)
    fetchAnalytics(defaultFilters)
  }

  const handleToggleCompareMode = () => {
    setCompareMode((prev) => !prev)
  }
  
  const quickViews: Array<{ id: QuickViewRange; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'last_week', label: 'Last Week' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'this_year', label: 'This Year' }
  ]

  const detailDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }),
    [timezone]
  )

  const formatDetailDate = useCallback(
    (value?: string | null) => {
      if (!value) return 'Unknown'
      try {
        return detailDateFormatter.format(new Date(value))
      } catch {
        return new Date(value).toLocaleString()
      }
    },
    [detailDateFormatter]
  )

  const closeDetailModal = useCallback(() => {
    setDetailModalOpen(false)
    setDetailMetricKey(null)
    setDetailItems([])
    setDetailError(null)
    setDetailLoading(false)
  }, [])

  const fetchMetricDetails = useCallback(
    async (metricKey: string, title: string) => {
      setDetailModalOpen(true)
      setDetailTitle(title)
      setDetailMetricKey(metricKey)
      setDetailLoading(true)
      setDetailError(null)

      try {
        const params = new URLSearchParams()

        Object.entries(filters).forEach(([key, value]) => {
          if (value && value !== 'all') {
            params.append(key, value)
          }
        })

        const query = params.toString()
        const baseUrl = `/api/analytics?detail=${encodeURIComponent(metricKey)}${
          query ? `&${query}` : ''
        }`
        const response = await fetch(appendViewAs(baseUrl), {
          credentials: 'include'
        })
        const data = await response.json()

        if (!response.ok) {
          setDetailError(data?.error || 'Failed to load details')
          setDetailItems([])
        } else {
          setDetailItems(data.detail?.items || [])
          if (data.timezone) {
            setTimezone(data.timezone)
          }
        }
      } catch (error: any) {
        setDetailError(error?.message || 'Failed to load details')
        setDetailItems([])
      } finally {
        setDetailLoading(false)
      }
    },
    [appendViewAs, filters]
  )

  const createMetricCardHandler = useCallback(
    (metricKey: string, title: string) => () => fetchMetricDetails(metricKey, title),
    [fetchMetricDetails]
  )

  const formatDaysValue = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return '—'
    }
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
      return '—'
    }
    return numeric.toFixed(1)
  }

  const formatSalesCycle = (value: number | null | undefined) =>
    formatDaysValue(value)

  const formatLeadTime = (value: number | null | undefined) =>
    formatDaysValue(value)

  const kpi = useMemo(() => {
    if (!analytics) return null

    const showRateValue = parseNumericValue(analytics.showRate)
    const showRateStatus = getKpiStatus(showRateValue, resolveTarget('showRate'))

    const cancellationRateValue = parseNumericValue(analytics.cancellationRate)
    const cancellationRateStatus = getKpiStatus(
      cancellationRateValue,
      resolveTarget('cancellationRate'),
      0.1,
      'lower'
    )

    const noShowRateValue = parseNumericValue(analytics.noShowRate)
    const noShowRateStatus = getKpiStatus(
      noShowRateValue,
      resolveTarget('noShowRate'),
      0.1,
      'lower'
    )

    const qualifiedRateValue = parseNumericValue(analytics.qualifiedRate)
    const qualifiedRateStatus = getKpiStatus(
      qualifiedRateValue,
      resolveTarget('qualifiedRate')
    )

    const closeRateValue = parseNumericValue(analytics.closeRate)
    const closeRateStatus = getKpiStatus(
      closeRateValue,
      resolveTarget('closeRate')
    )

    const revenuePerScheduledValue = parseNumericValue(
      analytics.dollarsOverScheduledCallsToDate
    )
    const revenuePerScheduledStatus = getKpiStatus(
      revenuePerScheduledValue,
      resolveTarget('revenuePerScheduled')
    )

    const revenuePerShowValue = parseNumericValue(analytics.dollarsOverShow)
    const revenuePerShowStatus = getKpiStatus(
      revenuePerShowValue,
      resolveTarget('revenuePerShow')
    )

    return {
      showRate: {
        value: showRateValue,
        status: showRateStatus,
        badge: getKpiBadge(showRateStatus),
        formatted: formatPercentValue(showRateValue)
      },
      cancellationRate: {
        value: cancellationRateValue,
        status: cancellationRateStatus,
        badge: getKpiBadge(cancellationRateStatus),
        formatted: formatPercentValue(cancellationRateValue)
      },
      noShowRate: {
        value: noShowRateValue,
        status: noShowRateStatus,
        badge: getKpiBadge(noShowRateStatus),
        formatted: formatPercentValue(noShowRateValue)
      },
      qualifiedRate: {
        value: qualifiedRateValue,
        status: qualifiedRateStatus,
        badge: getKpiBadge(qualifiedRateStatus),
        formatted: formatPercentValue(qualifiedRateValue)
      },
      closeRate: {
        value: closeRateValue,
        status: closeRateStatus,
        badge: getKpiBadge(closeRateStatus),
        formatted: formatPercentValue(closeRateValue)
      },
      revenuePerScheduled: {
        value: revenuePerScheduledValue,
        status: revenuePerScheduledStatus,
        badge: getKpiBadge(revenuePerScheduledStatus),
        formatted:
          Number.isFinite(revenuePerScheduledValue)
            ? `$${formatCurrencyValue(revenuePerScheduledValue, 2)}`
            : '—'
      },
      revenuePerShow: {
        value: revenuePerShowValue,
        status: revenuePerShowStatus,
        badge: getKpiBadge(revenuePerShowStatus),
        formatted:
          Number.isFinite(revenuePerShowValue)
            ? `$${formatCurrencyValue(revenuePerShowValue, 2)}`
            : '—'
      }
    }
  }, [analytics])

  const renderWithBadge = (formatted: string, badge?: string) => (
    <span className="inline-flex items-center gap-1 text-inherit font-semibold">
      <span>{formatted}</span>
      {badge ? <span>{badge}</span> : null}
    </span>
  )

  const showRateFormatted = kpi?.showRate.formatted ?? formatPercentValue(analytics?.showRate)
  const showRateBadge = kpi?.showRate.badge
  const cancellationRateFormatted =
    kpi?.cancellationRate.formatted ?? formatPercentValue(analytics?.cancellationRate)
  const cancellationRateBadge = kpi?.cancellationRate.badge
  const noShowRateFormatted =
    kpi?.noShowRate.formatted ?? formatPercentValue(analytics?.noShowRate)
  const noShowRateBadge = kpi?.noShowRate.badge
  const qualifiedRateFormatted =
    kpi?.qualifiedRate.formatted ?? formatPercentValue(analytics?.qualifiedRate)
  const qualifiedRateBadge = kpi?.qualifiedRate.badge
  const closeRateFormatted = kpi?.closeRate.formatted ?? formatPercentValue(analytics?.closeRate)
  const closeRateBadge = kpi?.closeRate.badge
  const revenuePerScheduledFormatted =
    kpi?.revenuePerScheduled.formatted ??
    (() => {
      const formatted = formatCurrencyValue(analytics?.dollarsOverScheduledCallsToDate, 2)
      return formatted === '—' ? formatted : `$${formatted}`
    })()
  const revenuePerScheduledBadge = kpi?.revenuePerScheduled.badge
  const revenuePerShowFormatted =
    kpi?.revenuePerShow.formatted ??
    (() => {
      const formatted = formatCurrencyValue(analytics?.dollarsOverShow, 2)
      return formatted === '—' ? formatted : `$${formatted}`
    })()
  const revenuePerShowBadge = kpi?.revenuePerShow.badge

  return (
    <>
      <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Sales Analytics</h1>
        <p className="text-gray-600">Deep dive into your sales performance</p>
        <p className="text-sm text-gray-500 mt-1">Reporting in {timezone}</p>
      </div>
      
      <FilterContextBar
        filters={filterChips}
        onRemoveFilter={(key) => handleRemoveFilter(key as keyof FilterState)}
        onClearAll={handleClearAllFilters}
        compareMode={compareMode}
        onToggleCompare={handleToggleCompareMode}
        appointmentCount={analytics?.scheduledCallsToDate ?? 0}
      />

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {quickViews.map((view) => (
              <Button
                key={view.id}
                variant={activeQuickView === view.id ? 'default' : 'outline'}
                onClick={() => handleQuickView(view.id)}
                className={activeQuickView === view.id ? '' : 'text-black'}
              >
                {view.label}
              </Button>
            ))}
          </div>
          <AdvancedFilters
            filters={draftFilters}
            onFilterChange={handleFilterChange}
            closers={closers}
            calendars={calendars}
          />
          
          <div className="mt-4 flex gap-2">
            <Button onClick={handleApplyFilters} disabled={loading}>
              {loading ? 'Loading...' : 'Apply Filters'}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              Export Report
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Key Metrics */}
      {analytics && (
        <>
          {/* Primary Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
            <ClickableMetricCard
              title="Calls Created"
              value={(analytics.callsCreated || 0).toLocaleString()}
              description="Appointments created in time frame"
              onClick={createMetricCardHandler('callsCreated', 'Calls Created')}
            />

            <ClickableMetricCard
              title="Scheduled Calls to Date"
              value={(analytics.scheduledCallsToDate || 0).toLocaleString()}
              description="Scheduled in time frame"
              onClick={createMetricCardHandler('scheduledCallsToDate', 'Scheduled Calls to Date')}
            />

            <ClickableMetricCard
              title="Cancellation Rate"
              value={renderWithBadge(cancellationRateFormatted, cancellationRateBadge)}
              description="Percent of scheduled calls canceled"
              status={kpi?.cancellationRate.status ?? 'neutral'}
            />

            <ClickableMetricCard
              title="No Show Rate"
              value={renderWithBadge(noShowRateFormatted, noShowRateBadge)}
              description="Percent of expected calls that no-showed"
              status={kpi?.noShowRate.status ?? 'neutral'}
            />

            <ClickableMetricCard
              title="Avg Sales Cycle"
              value={
                <>
                  {formatSalesCycle(analytics.averageSalesCycleDays)}{' '}
                  {typeof analytics.averageSalesCycleDays === 'number' ? 'days' : ''}
                </>
              }
              description={`Avg days from first call to close (${analytics.salesCycleCount || 0} deals)`}
              onClick={createMetricCardHandler('salesCycle', 'Average Sales Cycle')}
            />

            <ClickableMetricCard
              title="Avg Lead Time"
              value={
                <>
                  {formatLeadTime(analytics.averageAppointmentLeadTimeDays)}{' '}
                  {typeof analytics.averageAppointmentLeadTimeDays === 'number' ? 'days' : ''}
                </>
              }
              description={`Avg days from creation to actual start (${analytics.appointmentLeadTimeCount || 0} appts)`}
              onClick={createMetricCardHandler('appointmentLeadTime', 'Average Appointment Lead Time')}
            />
          </div>
          
          {/* Performance Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <ClickableMetricCard
              title="Show Rate"
              value={renderWithBadge(showRateFormatted, showRateBadge)}
              description={`${analytics.callsShown || 0} calls shown`}
              status={kpi?.showRate.status ?? 'neutral'}
            />

            <ClickableMetricCard
              title="Qualified Calls"
              value={(analytics.qualifiedCalls || 0).toLocaleString()}
              description={
                <>
                  Qualified Rate:{' '}
                  {renderWithBadge(qualifiedRateFormatted, qualifiedRateBadge)}
                </>
              }
              status={kpi?.qualifiedRate.status ?? 'neutral'}
              onClick={createMetricCardHandler('qualifiedCalls', 'Qualified Calls')}
            />

            <ClickableMetricCard
              title="Total Units Closed"
              value={(analytics.totalUnitsClosed || 0).toLocaleString()}
              description={
                <>
                  Close Rate:{' '}
                  {renderWithBadge(closeRateFormatted, closeRateBadge)}
                </>
              }
              status={kpi?.closeRate.status ?? 'neutral'}
              onClick={createMetricCardHandler('totalUnitsClosed', 'Total Units Closed')}
            />

            <ClickableMetricCard
              title="Scheduled Calls to Closed"
              value={`${(analytics.scheduledCallsToClosed || 0).toFixed(1)}%`}
              description="Closed ÷ Scheduled"
            />
          </div>
          
          {/* Revenue Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <ClickableMetricCard
              title="Cash Collected"
              value={`$${(analytics.cashCollected || 0).toLocaleString()}`}
              description="Total cash collected"
              onClick={createMetricCardHandler('cashCollected', 'Cash Collected')}
            />

            <ClickableMetricCard
              title="$ per Scheduled Call"
              value={renderWithBadge(revenuePerScheduledFormatted, revenuePerScheduledBadge)}
              description="Cash ÷ Scheduled Calls"
              status={kpi?.revenuePerScheduled.status ?? 'neutral'}
            />

            <ClickableMetricCard
              title="$ per Showed Call"
              value={renderWithBadge(revenuePerShowFormatted, revenuePerShowBadge)}
              description="Cash ÷ Calls Shown"
              status={kpi?.revenuePerShow.status ?? 'neutral'}
            />

            <ClickableMetricCard
              title="Missing PCNs"
              value={
                <span className="text-red-600">
                  {(analytics.missingPCNs || 0).toLocaleString()}
                </span>
              }
              description="Overdue PCN submissions"
              status="danger"
              onClick={createMetricCardHandler('missingPCNs', 'Missing PCNs')}
            />
          </div>
          
          {/* View Tabs */}
          <div className="flex gap-2 mb-6">
            <Button
              variant={activeView === 'overview' ? 'default' : 'outline'}
              onClick={() => setActiveView('overview')}
              className={activeView !== 'overview' ? 'text-black' : ''}
            >
              Overview
            </Button>
            <Button
              variant={activeView === 'closers' ? 'default' : 'outline'}
              onClick={() => setActiveView('closers')}
              className={activeView !== 'closers' ? 'text-black' : ''}
            >
              By Closer
            </Button>
            <Button
              variant={activeView === 'calendars' ? 'default' : 'outline'}
              onClick={() => setActiveView('calendars')}
              className={activeView !== 'calendars' ? 'text-black' : ''}
            >
              By Calendar/Source
            </Button>
            <Button
              variant={activeView === 'objections' ? 'default' : 'outline'}
              onClick={() => setActiveView('objections')}
              className={activeView !== 'objections' ? 'text-black' : ''}
            >
              By Objection
            </Button>
          </div>
          
          {/* Content based on active view */}
          {activeView === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Day of Week */}
              <Card>
                <CardHeader>
                  <CardTitle>By Day of Week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Day</th>
                          <th className="text-right py-2">Appts</th>
                          <th className="text-right py-2">Show%</th>
                          <th className="text-right py-2">Close%</th>
                          <th className="text-right py-2">Avg Cycle (days)</th>
                          <th className="text-right py-2">Avg Lead (days)</th>
                          <th className="text-right py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byDayOfWeek?.map((day: any) => (
                          <tr
                            key={day.dayOfWeek ?? day.dayName}
                            className={cn(
                              'border-b transition-colors',
                              day.dayOfWeek !== undefined ? 'cursor-pointer hover:bg-accent' : ''
                            )}
                            onClick={() => {
                              if (day.dayOfWeek !== undefined) {
                                handleAddFilter('dayOfWeek', String(day.dayOfWeek))
                              }
                            }}
                          >
                            <td className="py-2">{day.dayName}</td>
                            <td className="text-right">{day.total}</td>
                            <td className="text-right">{day.showRate}%</td>
                            <td className="text-right">{day.closeRate}%</td>
                            <td className="text-right">
                              {formatSalesCycle(day.averageSalesCycleDays)}
                            </td>
                            <td className="text-right">
                              {formatLeadTime(day.averageLeadTimeDays)}
                            </td>
                            <td className="text-right">${day.revenue?.toLocaleString()}</td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              
              {/* By Time of Day */}
              <Card>
                <CardHeader>
                  <CardTitle>By Time of Day</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Period</th>
                          <th className="text-right py-2">Appts</th>
                          <th className="text-right py-2">Show%</th>
                          <th className="text-right py-2">Close%</th>
                          <th className="text-right py-2">Avg Cycle (days)</th>
                          <th className="text-right py-2">Avg Lead (days)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byTimeOfDay?.map((period: any) => {
                          const filterValue = period.period?.toLowerCase?.()
                          const label = filterValue
                            ? TIME_OF_DAY_LABELS[filterValue] ?? period.period
                            : period.period
                          return (
                            <tr
                              key={period.period}
                              className={cn(
                                'border-b transition-colors',
                                filterValue ? 'cursor-pointer hover:bg-accent' : ''
                              )}
                              onClick={() => {
                                if (filterValue) {
                                  handleAddFilter('timeOfDay', filterValue)
                                }
                              }}
                            >
                              <td className="py-2">{period.period}</td>
                              <td className="text-right">{period.total}</td>
                              <td className="text-right">{period.showRate}%</td>
                              <td className="text-right">{period.closeRate}%</td>
                              <td className="text-right">
                                {formatSalesCycle(period.averageSalesCycleDays)}
                              </td>
                              <td className="text-right">
                                {formatLeadTime(period.averageLeadTimeDays)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              
              {/* By Appointment Type */}
              <Card>
                <CardHeader>
                  <CardTitle>First Call vs Follow Up</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Type</th>
                          <th className="text-right py-2">Appts</th>
                          <th className="text-right py-2">Show%</th>
                          <th className="text-right py-2">Close%</th>
                          <th className="text-right py-2">Avg Cycle (days)</th>
                          <th className="text-right py-2">Avg Lead (days)</th>
                          <th className="text-right py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byAppointmentType?.map((type: any) => (
                          <tr
                            key={type.type}
                            className={cn('border-b transition-colors', 'cursor-pointer hover:bg-accent')}
                            onClick={() => {
                              const value =
                                type.type === 'First Call'
                                  ? 'first_call'
                                  : type.type === 'Follow Up'
                                    ? 'follow_up'
                                    : type.type
                              handleAddFilter('appointmentType', value)
                            }}
                          >
                            <td className="py-2">{type.type}</td>
                            <td className="text-right">{type.total}</td>
                            <td className="text-right">{type.showRate}%</td>
                            <td className="text-right">{type.closeRate}%</td>
                            <td className="text-right">
                              {formatSalesCycle(type.averageSalesCycleDays)}
                            </td>
                            <td className="text-right">
                              {formatLeadTime(type.averageLeadTimeDays)}
                            </td>
                            <td className="text-right">${type.revenue?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {activeView === 'closers' && (
            <Card>
              <CardHeader>
                <CardTitle>Performance by Closer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Closer</th>
                        <th className="text-right py-2">Appts</th>
                        <th className="text-right py-2">Show%</th>
                        <th className="text-right py-2">Close%</th>
                        <th className="text-right py-2">Deals</th>
                        <th className="text-right py-2">Avg Cycle (days)</th>
                        <th className="text-right py-2">Avg Lead (days)</th>
                        <th className="text-right py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byCloser?.map((closer: any) => (
                        <tr
                          key={closer.closerEmail}
                          className={cn(
                            'border-b transition-colors',
                            closer.closerId ? 'cursor-pointer hover:bg-accent' : ''
                          )}
                          onClick={() => {
                            if (closer.closerId) {
                              handleAddFilter('closer', closer.closerId)
                            }
                          }}
                        >
                          <td className="py-2">{closer.closerName}</td>
                          <td className="text-right">{closer.total}</td>
                          <td className="text-right">{closer.showRate}%</td>
                          <td className="text-right">{closer.closeRate}%</td>
                          <td className="text-right">{closer.signed}</td>
                          <td className="text-right">
                            {formatSalesCycle(closer.averageSalesCycleDays)}
                          </td>
                          <td className="text-right">
                            {formatLeadTime(closer.averageLeadTimeDays)}
                          </td>
                          <td className="text-right font-semibold">
                            ${closer.revenue?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          
          {activeView === 'calendars' && (
            <Card>
              <CardHeader>
                <CardTitle>Performance by Calendar/Traffic Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Calendar</th>
                        <th className="text-right py-2">Appts</th>
                        <th className="text-right py-2">Show%</th>
                        <th className="text-right py-2">Close%</th>
                        <th className="text-right py-2">Deals</th>
                        <th className="text-right py-2">Avg Cycle (days)</th>
                        <th className="text-right py-2">Avg Lead (days)</th>
                        <th className="text-right py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byCalendar?.map((cal: any) => (
                        <tr
                          key={cal.calendar}
                          className={cn(
                            'border-b transition-colors',
                            cal.calendar ? 'cursor-pointer hover:bg-accent' : ''
                          )}
                          onClick={() => {
                            if (cal.calendar) {
                              handleAddFilter('calendar', cal.calendar)
                            }
                          }}
                        >
                          <td className="py-2">{cal.calendar}</td>
                          <td className="text-right">{cal.total}</td>
                          <td className="text-right">{cal.showRate}%</td>
                          <td className="text-right">{cal.closeRate}%</td>
                          <td className="text-right">{cal.signed}</td>
                          <td className="text-right">
                            {formatSalesCycle(cal.averageSalesCycleDays)}
                          </td>
                          <td className="text-right">
                            {formatLeadTime(cal.averageLeadTimeDays)}
                          </td>
                          <td className="text-right font-semibold">
                            ${cal.revenue?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          
          {activeView === 'objections' && (
            <Card>
              <CardHeader>
                <CardTitle>Objection Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Objection Type</th>
                        <th className="text-right py-2">Count</th>
                        <th className="text-right py-2">Converted</th>
                        <th className="text-right py-2">Conversion Rate</th>
                        <th className="text-right py-2">Avg Cycle (days)</th>
                        <th className="text-right py-2">Avg Lead (days)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byObjection?.map((obj: any) => (
                        <tr
                          key={obj.type}
                          className={cn(
                            'border-b transition-colors',
                            obj.type ? 'cursor-pointer hover:bg-accent' : ''
                          )}
                          onClick={() => {
                            if (obj.type) {
                              handleAddFilter('objectionType', obj.type)
                            }
                          }}
                        >
                          <td className="py-2">{obj.type}</td>
                          <td className="text-right">{obj.count}</td>
                          <td className="text-right">{obj.converted}</td>
                          <td className="text-right">
                            <span className={`font-semibold ${
                              parseFloat(obj.conversionRate) > 20 
                                ? 'text-green-600' 
                                : parseFloat(obj.conversionRate) > 10
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {obj.conversionRate}%
                            </span>
                          </td>
                          <td className="text-right">
                            {formatSalesCycle(obj.averageSalesCycleDays)}
                          </td>
                          <td className="text-right">
                            {formatLeadTime(obj.averageLeadTimeDays)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      </div>
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl max-h-full overflow-hidden">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">{detailTitle}</h2>
                <p className="text-xs text-gray-500">
                  {detailItems.length} records · Reporting in {timezone}
                </p>
              </div>
              <button
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={closeDetailModal}
              >
                Close
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto max-h-[70vh]">
              {detailLoading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : detailError ? (
                <p className="text-sm text-red-600">{detailError}</p>
              ) : detailItems.length === 0 ? (
                <p className="text-sm text-gray-500">No records for the selected filters.</p>
              ) : (
                detailItems.map((item, index) => {
                  const key = item.id || item.saleId || `${detailMetricKey}-${index}`
                  return (
                    <div key={key} className="border rounded-md p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {item.contactName ||
                              item.saleId ||
                              item.appointmentId ||
                              `Record ${index + 1}`}
                          </p>
                          <p className="text-xs text-gray-500">
                            Closer: {item.closerName || 'Unassigned'}
                          </p>
                        </div>
                        {item.amount !== undefined && item.amount !== null && (
                          <p className="text-sm font-semibold text-gray-800">
                            ${Number(item.amount).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {item.type && <span>Type: {item.type}</span>}
                        {item.scheduledAt && (
                          <span>Scheduled: {formatDetailDate(item.scheduledAt)}</span>
                        )}
                        {item.createdAt && (
                          <span>Created: {formatDetailDate(item.createdAt)}</span>
                        )}
                        {item.paidAt && <span>Paid: {formatDetailDate(item.paidAt)}</span>}
                        {item.pcnSubmittedAt && (
                          <span>PCN Submitted: {formatDetailDate(item.pcnSubmittedAt)}</span>
                        )}
                        {item.salesCycleDays !== undefined &&
                          item.salesCycleDays !== null && (
                            <span>
                              Sales Cycle: {formatSalesCycle(item.salesCycleDays)} days
                            </span>
                          )}
                        {item.appointmentLeadTimeDays !== undefined &&
                          item.appointmentLeadTimeDays !== null && (
                            <span>
                              Lead Time: {formatLeadTime(item.appointmentLeadTimeDays)} days
                            </span>
                          )}
                        {item.startTime && (
                          <span>Started: {formatDetailDate(item.startTime)}</span>
                        )}
                        {item.firstCallAt && (
                          <span>First Call: {formatDetailDate(item.firstCallAt)}</span>
                        )}
                        {item.closedAt && (
                          <span>Closed: {formatDetailDate(item.closedAt)}</span>
                        )}
                        {item.minutesSinceScheduled !== undefined && (
                          <span>Minutes overdue: {item.minutesSinceScheduled}</span>
                        )}
                        {item.status && <span>Status: {item.status}</span>}
                        {item.outcome && <span>Outcome: {item.outcome}</span>}
                        {item.cashCollected !== undefined &&
                          item.cashCollected !== null &&
                          (item.amount === undefined || item.amount === null) && (
                            <span>
                              Cash Collected:{' '}
                              ${Number(item.cashCollected).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </span>
                          )}
                      </div>
                      {item.notes && (
                        <p className="text-sm text-gray-600">Notes: {item.notes}</p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}


'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import AdvancedFilters from '@/components/AdvancedFilters'
import {
  FilterContextBar,
  type FilterChip as AnalyticsFilterChip
} from '@/components/analytics/FilterContextBar'
import { ClickableMetricCard } from '@/components/analytics/ClickableMetricCard'
import { ComparisonView } from '@/components/analytics/ComparisonView'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getKpiBadge, getKpiColorClass, getKpiStatus, resolveTarget } from '@/lib/analytics-kpi'
import { generateInsights, type AnalyticsSnapshot, type Insight } from '@/lib/analytics-insights'
import { getComparisonLabel, type ComparisonTarget } from '@/lib/analytics-comparison'
import { useTableState, type TableColumn, type TableState } from '@/components/analytics/table-utils'
import { SelectedComparisonPanel, type ComparisonMetric } from '@/components/analytics/SelectedComparisonPanel'
import { TimeSeriesLineChart } from '@/components/analytics/charts/TimeSeriesLineChart'
import { DayOfWeekBarChart } from '@/components/analytics/charts/DayOfWeekBarChart'
import { CalendarStackedBarChart } from '@/components/analytics/charts/CalendarStackedBarChart'

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

const toAnalyticsSnapshot = (data: any | null | undefined): AnalyticsSnapshot | null => {
  if (!data) {
    return null
  }

  return {
    showRate: parseNumericValue(data.showRate),
    closeRate: parseNumericValue(data.closeRate),
    cancellationRate: parseNumericValue(data.cancellationRate),
    noShowRate: parseNumericValue(data.noShowRate),
    qualifiedRate: parseNumericValue(data.qualifiedRate),
    cashCollected: Number(data.cashCollected ?? 0),
    scheduledCallsToDate: Number(data.scheduledCallsToDate ?? 0),
    qualifiedCalls: Number(data.qualifiedCalls ?? 0),
    totalUnitsClosed: Number(data.totalUnitsClosed ?? 0),
    dollarsOverScheduledCallsToDate: parseNumericValue(data.dollarsOverScheduledCallsToDate),
    dollarsOverShow: parseNumericValue(data.dollarsOverShow),
    averageSalesCycleDays: parseNumericValue(data.averageSalesCycleDays),
    averageAppointmentLeadTimeDays: parseNumericValue(data.averageAppointmentLeadTimeDays)
  }
}

const MS_IN_DAY = 1000 * 60 * 60 * 24

const toDateSafe = (value?: string | null): Date | null => {
  if (!value) return null
  const [year, month, day] = value.split('-').map((part) => parseInt(part, 10))
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
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

const formatNumber = (value: unknown, fractionDigits = 0): string => {
  const numeric = parseNumericValue(value)
  if (!Number.isFinite(numeric)) return '—'
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })
}

const formatCurrencyString = (value: unknown, fractionDigits = 0): string => {
  const formatted = formatCurrencyValue(value, fractionDigits)
  return formatted === '—' ? formatted : `$${formatted}`
}

const formatPercentString = (value: unknown): string => formatPercentValue(value)

const dayOfWeekColumns: TableColumn<any>[] = [
  { key: 'dayName', label: 'Day', searchAccessor: (row) => row.dayName ?? '' },
  { key: 'total', label: 'Appts', numeric: true, format: (_, row) => formatNumber(row.total), sortAccessor: (row) => row.total ?? 0 },
  { key: 'showRate', label: 'Show%', numeric: true, format: (_, row) => formatPercentString(row.showRate), sortAccessor: (row) => Number(row.showRate ?? 0) },
  { key: 'closeRate', label: 'Close%', numeric: true, format: (_, row) => formatPercentString(row.closeRate), sortAccessor: (row) => Number(row.closeRate ?? 0) },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', numeric: true, format: (_, row) => formatNumber(row.averageSalesCycleDays, 1), sortAccessor: (row) => Number(row.averageSalesCycleDays ?? 0) },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', numeric: true, format: (_, row) => formatNumber(row.averageLeadTimeDays, 1), sortAccessor: (row) => Number(row.averageLeadTimeDays ?? 0) },
  { key: 'revenue', label: 'Revenue', numeric: true, format: (_, row) => formatCurrencyString(row.revenue), sortAccessor: (row) => Number(row.revenue ?? 0) }
]

const dayOfWeekComparisonMetrics: ComparisonMetric<any>[] = [
  { key: 'total', label: 'Appointments', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'showRate', label: 'Show Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'closeRate', label: 'Close Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'revenue', label: 'Revenue', format: (value) => formatCurrencyString(value), higherIsBetter: true }
]

const timeOfDayColumns: TableColumn<any>[] = [
  { key: 'period', label: 'Period', searchAccessor: (row) => row.period ?? '' },
  { key: 'total', label: 'Appts', numeric: true, format: (_, row) => formatNumber(row.total), sortAccessor: (row) => row.total ?? 0 },
  { key: 'showRate', label: 'Show%', numeric: true, format: (_, row) => formatPercentString(row.showRate), sortAccessor: (row) => Number(row.showRate ?? 0) },
  { key: 'closeRate', label: 'Close%', numeric: true, format: (_, row) => formatPercentString(row.closeRate), sortAccessor: (row) => Number(row.closeRate ?? 0) },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', numeric: true, format: (_, row) => formatNumber(row.averageSalesCycleDays, 1), sortAccessor: (row) => Number(row.averageSalesCycleDays ?? 0) },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', numeric: true, format: (_, row) => formatNumber(row.averageLeadTimeDays, 1), sortAccessor: (row) => Number(row.averageLeadTimeDays ?? 0) }
]

const timeOfDayComparisonMetrics: ComparisonMetric<any>[] = [
  { key: 'total', label: 'Appointments', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'showRate', label: 'Show Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'closeRate', label: 'Close Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false }
]

const appointmentTypeColumns: TableColumn<any>[] = [
  { key: 'type', label: 'Type', searchAccessor: (row) => row.type ?? '' },
  { key: 'total', label: 'Appts', numeric: true, format: (_, row) => formatNumber(row.total), sortAccessor: (row) => row.total ?? 0 },
  { key: 'showRate', label: 'Show%', numeric: true, format: (_, row) => formatPercentString(row.showRate), sortAccessor: (row) => Number(row.showRate ?? 0) },
  { key: 'closeRate', label: 'Close%', numeric: true, format: (_, row) => formatPercentString(row.closeRate), sortAccessor: (row) => Number(row.closeRate ?? 0) },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', numeric: true, format: (_, row) => formatNumber(row.averageSalesCycleDays, 1), sortAccessor: (row) => Number(row.averageSalesCycleDays ?? 0) },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', numeric: true, format: (_, row) => formatNumber(row.averageLeadTimeDays, 1), sortAccessor: (row) => Number(row.averageLeadTimeDays ?? 0) },
  { key: 'revenue', label: 'Revenue', numeric: true, format: (_, row) => formatCurrencyString(row.revenue), sortAccessor: (row) => Number(row.revenue ?? 0) }
]

const appointmentTypeComparisonMetrics: ComparisonMetric<any>[] = [
  { key: 'total', label: 'Appointments', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'showRate', label: 'Show Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'closeRate', label: 'Close Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'revenue', label: 'Revenue', format: (value) => formatCurrencyString(value), higherIsBetter: true }
]

const closerColumns: TableColumn<any>[] = [
  { key: 'closerName', label: 'Closer', searchAccessor: (row) => row.closerName ?? row.closerEmail ?? '' },
  { key: 'total', label: 'Appts', numeric: true, format: (_, row) => formatNumber(row.total), sortAccessor: (row) => row.total ?? 0 },
  { key: 'showRate', label: 'Show%', numeric: true, format: (_, row) => formatPercentString(row.showRate), sortAccessor: (row) => Number(row.showRate ?? 0) },
  { key: 'closeRate', label: 'Close%', numeric: true, format: (_, row) => formatPercentString(row.closeRate), sortAccessor: (row) => Number(row.closeRate ?? 0) },
  { key: 'signed', label: 'Deals', numeric: true, format: (_, row) => formatNumber(row.signed), sortAccessor: (row) => row.signed ?? 0 },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', numeric: true, format: (_, row) => formatNumber(row.averageSalesCycleDays, 1), sortAccessor: (row) => Number(row.averageSalesCycleDays ?? 0) },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', numeric: true, format: (_, row) => formatNumber(row.averageLeadTimeDays, 1), sortAccessor: (row) => Number(row.averageLeadTimeDays ?? 0) },
  { key: 'revenue', label: 'Revenue', numeric: true, format: (_, row) => formatCurrencyString(row.revenue), sortAccessor: (row) => Number(row.revenue ?? 0) }
]

const closerComparisonMetrics: ComparisonMetric<any>[] = [
  { key: 'total', label: 'Appointments', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'showRate', label: 'Show Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'closeRate', label: 'Close Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'signed', label: 'Deals Closed', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'revenue', label: 'Revenue', format: (value) => formatCurrencyString(value), higherIsBetter: true }
]

const calendarColumns: TableColumn<any>[] = [
  { key: 'calendar', label: 'Calendar', searchAccessor: (row) => row.calendar ?? '' },
  { key: 'total', label: 'Appts', numeric: true, format: (_, row) => formatNumber(row.total), sortAccessor: (row) => row.total ?? 0 },
  { key: 'showRate', label: 'Show%', numeric: true, format: (_, row) => formatPercentString(row.showRate), sortAccessor: (row) => Number(row.showRate ?? 0) },
  { key: 'closeRate', label: 'Close%', numeric: true, format: (_, row) => formatPercentString(row.closeRate), sortAccessor: (row) => Number(row.closeRate ?? 0) },
  { key: 'signed', label: 'Deals', numeric: true, format: (_, row) => formatNumber(row.signed), sortAccessor: (row) => row.signed ?? 0 },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', numeric: true, format: (_, row) => formatNumber(row.averageSalesCycleDays, 1), sortAccessor: (row) => Number(row.averageSalesCycleDays ?? 0) },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', numeric: true, format: (_, row) => formatNumber(row.averageLeadTimeDays, 1), sortAccessor: (row) => Number(row.averageLeadTimeDays ?? 0) },
  { key: 'revenue', label: 'Revenue', numeric: true, format: (_, row) => formatCurrencyString(row.revenue), sortAccessor: (row) => Number(row.revenue ?? 0) }
]

const calendarComparisonMetrics: ComparisonMetric<any>[] = [
  { key: 'total', label: 'Appointments', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'showRate', label: 'Show Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'closeRate', label: 'Close Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'signed', label: 'Deals', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'revenue', label: 'Revenue', format: (value) => formatCurrencyString(value), higherIsBetter: true }
]

const objectionColumns: TableColumn<any>[] = [
  { key: 'type', label: 'Objection', searchAccessor: (row) => row.type ?? '' },
  { key: 'count', label: 'Count', numeric: true, format: (_, row) => formatNumber(row.count), sortAccessor: (row) => row.count ?? 0 },
  { key: 'converted', label: 'Converted', numeric: true, format: (_, row) => formatNumber(row.converted), sortAccessor: (row) => row.converted ?? 0 },
  { key: 'conversionRate', label: 'Conversion Rate', numeric: true, format: (_, row) => formatPercentString(row.conversionRate), sortAccessor: (row) => Number(row.conversionRate ?? 0) },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', numeric: true, format: (_, row) => formatNumber(row.averageSalesCycleDays, 1), sortAccessor: (row) => Number(row.averageSalesCycleDays ?? 0) },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', numeric: true, format: (_, row) => formatNumber(row.averageLeadTimeDays, 1), sortAccessor: (row) => Number(row.averageLeadTimeDays ?? 0) }
]

const objectionComparisonMetrics: ComparisonMetric<any>[] = [
  { key: 'count', label: 'Count', format: (value) => formatNumber(value), higherIsBetter: false },
  { key: 'converted', label: 'Converted', format: (value) => formatNumber(value), higherIsBetter: true },
  { key: 'conversionRate', label: 'Conversion Rate (%)', format: (value) => formatPercentString(value), higherIsBetter: true },
  { key: 'averageSalesCycleDays', label: 'Avg Cycle (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false },
  { key: 'averageLeadTimeDays', label: 'Avg Lead (days)', format: (value) => formatNumber(value, 1), higherIsBetter: false }
]

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters())
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters())
  const [compareMode, setCompareMode] = useState(false)
  const [comparisonTarget, setComparisonTarget] = useState<ComparisonTarget>('overall')
  const [overviewMode, setOverviewMode] = useState<'charts' | 'tables'>('charts')
  const [comparisonData, setComparisonData] = useState<any | null>(null)
  const [comparisonLabel, setComparisonLabel] = useState(getComparisonLabel('overall'))
  const [comparisonInsights, setComparisonInsights] = useState<Insight[]>([])
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  
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
  
  const fetchAnalytics = async (overrideFilters?: FilterState, comparisonOverride?: ComparisonTarget | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const filtersToUse = overrideFilters ?? filters
      Object.entries(filtersToUse).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      const urlParams = new URLSearchParams(window.location.search)
      const viewAs = urlParams.get('viewAs')
      if (viewAs) {
        params.append('viewAs', viewAs)
      }
      const compareTarget = comparisonOverride ?? (compareMode ? comparisonTarget : null)
      if (compareTarget) {
        params.append('compareWith', compareTarget)
      }
      const res = await fetch(`/api/analytics?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch analytics')
      }
      const primaryData = data.primary ?? data
      setAnalytics(primaryData)
      if (primaryData.timezone) {
        setTimezone(primaryData.timezone)
      }
      if (primaryData.byCalendar) {
        setCalendars(primaryData.byCalendar.map((c: any) => c.calendar))
      }
      if (compareTarget && data.comparison) {
        setComparisonData(data.comparison)
        const primarySnapshot = toAnalyticsSnapshot(primaryData)
        const comparisonSnapshot = toAnalyticsSnapshot(data.comparison)
        setComparisonInsights(generateInsights(primarySnapshot, comparisonSnapshot))
        setComparisonLabel(data.meta?.comparisonLabel || getComparisonLabel(compareTarget))
        setComparisonError(null)
      } else {
        setComparisonData(null)
        setComparisonInsights([])
      }
    } catch (error: any) {
      console.error('Failed to fetch analytics:', error)
      if (compareMode) {
        setComparisonError(error?.message || 'Failed to load comparison data')
      }
    }
    setLoading(false)
  }

  const fetchComparisonData = useCallback(
    async (baseFilters: FilterState, primaryData: any, targetOverride?: ComparisonTarget) => {
      const target = targetOverride ?? comparisonTarget ?? 'overall'
      await fetchAnalytics(baseFilters, target)
    },
    [comparisonTarget]
  )
  
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
    const next = !compareMode
    setCompareMode(next)
    if (!next) {
      setComparisonData(null)
      setComparisonError(null)
      setComparisonInsights([])
      setComparisonLabel(getComparisonLabel('overall'))
    } else if (analytics) {
      fetchComparisonData(filters, analytics, comparisonTarget)
    }
  }

  const handleComparisonTargetChange = (target: ComparisonTarget) => {
    setComparisonTarget(target)
    if (compareMode && analytics) {
      fetchComparisonData(filters, analytics, target)
    }
  }

  const handleComparisonRetry = () => {
    if (analytics) {
      fetchComparisonData(filters, analytics, comparisonTarget)
    }
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
          // The API returns { primary: { detail: { items: [...] } } } or { detail: { items: [...] } }
          const detailData = data.primary?.detail || data.detail
          setDetailItems(detailData?.items || [])
          const timezoneData = data.primary?.timezone || data.timezone
          if (timezoneData) {
            setTimezone(timezoneData)
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

  useEffect(() => {
    if (!compareMode) {
      setComparisonData(null)
      setComparisonInsights([])
      setComparisonError(null)
      setComparisonLoading(false)
      return
    }

    if (analytics) {
      fetchComparisonData(filters, analytics, comparisonTarget)
    }
  }, [compareMode, comparisonTarget, analytics, filters, fetchComparisonData])

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

  const hasDayOfWeekFilter = Array.isArray(filters.dayOfWeek)
    ? filters.dayOfWeek.length > 0
    : Boolean(filters.dayOfWeek)

  const generateId = () => Math.random().toString(36).slice(2, 10)

  const dayOfWeekTable = useTableState({
    data: analytics?.byDayOfWeek ?? [],
    columns: dayOfWeekColumns,
    getId: (row) => String(row.dayOfWeek ?? row.dayName ?? generateId())
  })

  const timeOfDayTable = useTableState({
    data: analytics?.byTimeOfDay ?? [],
    columns: timeOfDayColumns,
    getId: (row) => String(row.period ?? generateId())
  })

  const appointmentTypeTable = useTableState({
    data: analytics?.byAppointmentType ?? [],
    columns: appointmentTypeColumns,
    getId: (row) => String(row.type ?? generateId())
  })

  const closerTable = useTableState({
    data: analytics?.byCloser ?? [],
    columns: closerColumns,
    getId: (row) => String(row.closerEmail ?? row.closerId ?? row.closerName ?? generateId())
  })

  const calendarTable = useTableState({
    data: analytics?.byCalendar ?? [],
    columns: calendarColumns,
    getId: (row) => String(row.calendar ?? generateId())
  })

  const objectionTable = useTableState({
    data: analytics?.byObjection ?? [],
    columns: objectionColumns,
    getId: (row) => String(row.type ?? generateId())
  })

  const timeSeriesData = analytics?.byDate ?? []
  const dayOfWeekData = analytics?.byDayOfWeek ?? []
  const calendarChartData = analytics?.byCalendar ?? []

  const handleSetDateRange = (date: string) => {
    const updatedFilters: FilterState = {
      ...filters,
      dateFrom: date,
      dateTo: date
    }
    setFilters(updatedFilters)
    setDraftFilters(updatedFilters)
    setActiveQuickView(null)
    updateUrlFromFilters(updatedFilters)
    fetchAnalytics(updatedFilters)
  }

  const renderBreakdownTable = <T extends Record<string, any>>(
    title: string,
    table: TableState<T>,
    columns: TableColumn<T>[],
    metrics: ComparisonMetric<T>[],
    getName: (row: T) => string,
    exportFileName: string,
    onRowClick?: (row: T) => void,
    searchPlaceholder = 'Search…',
    emptyMessage = 'No records found for the current filters.'
  ) => {
    const pageRowIds = table.displayedRows.map((row) => table.getId(row))
    const allSelected = pageRowIds.length > 0 && pageRowIds.every((id) => table.isSelected(id))
    const someSelected = pageRowIds.some((id) => table.isSelected(id)) && !allSelected
    const startIndex = table.page * table.pageSize
    const endIndex = Math.min(startIndex + table.pageSize, table.allRows.length)

    return (
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{title}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {table.selectedRows.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={table.clearSelection}>
                  Clear Selection
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => table.exportCsv(exportFileName)}>
                Export CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              value={table.searchTerm}
              onChange={(event) => {
                table.setSearchTerm(event.target.value)
                table.setPage(0)
              }}
              placeholder={searchPlaceholder}
              className="w-full md:w-64"
            />

            <div className="flex items-center gap-2">
              <Select
                value={String(table.pageSize)}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                  table.setPage(0)
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  {table.pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={() => {
                        const shouldSelect = !allSelected
                        table.setSelection(pageRowIds, shouldSelect)
                      }}
                      aria-label="Toggle select all rows"
                    />
                  </th>
                  {columns.map((column) => (
                    <th
                      key={String(column.key)}
                      className={cn('px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground', column.numeric && 'text-right')}
                    >
                      <button
                        type="button"
                        onClick={() => table.toggleSort(column.key)}
                        className="flex items-center gap-1"
                      >
                        <span>{column.label}</span>
                        {table.sortKey === column.key ? (
                          <span>{table.sortDirection === 'asc' ? '▲' : '▼'}</span>
                        ) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.displayedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="px-3 py-6 text-center text-sm text-muted-foreground"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  table.displayedRows.map((row) => {
                    const id = table.getId(row)
                    const isRowSelected = table.isSelected(id)
                    const clickable = Boolean(onRowClick)

                    return (
                      <tr
                        key={id}
                        className={cn(
                          'border-b transition-colors',
                          clickable && 'cursor-pointer hover:bg-accent',
                          isRowSelected && 'bg-accent/40'
                        )}
                        onClick={() => onRowClick?.(row)}
                      >
                        <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={isRowSelected}
                            onCheckedChange={() => table.toggleSelect(id)}
                            aria-label={`Select ${getName(row)}`}
                          />
                        </td>
                        {columns.map((column) => {
                          const rawValue = (row as any)[column.key]
                          const formatted = column.format
                            ? column.format(rawValue, row)
                            : rawValue ?? '—'
                          return (
                            <td
                              key={String(column.key)}
                              className={cn('whitespace-nowrap px-3 py-2 text-sm text-foreground', column.numeric ? 'text-right' : 'text-left')}
                            >
                              {formatted}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>
              {table.allRows.length === 0
                ? 'No results'
                : `Showing ${startIndex + 1}–${endIndex} of ${table.allRows.length}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPage(Math.max(table.page - 1, 0))}
                disabled={table.page === 0}
              >
                Previous
              </Button>
              <span>
                Page {table.page + 1} of {table.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPage(Math.min(table.page + 1, table.totalPages - 1))}
                disabled={table.page >= table.totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>

          {metrics.length > 0 && table.selectedRows.length >= 2 ? (
            <SelectedComparisonPanel
              rows={table.selectedRows}
              metrics={metrics}
              title={`Compare Selected (${table.selectedRows.length})`}
              description="Baseline is the first selected row. Select rows in the order you want to compare."
              getName={getName}
            />
          ) : null}
        </CardContent>
      </Card>
    )
  }

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
      
      {compareMode && analytics ? (
        <div className="mb-8">
          <ComparisonView
            primaryData={analytics}
            comparisonData={comparisonData}
            comparisonLabel={comparisonLabel}
            comparisonTarget={comparisonTarget}
            onTargetChange={handleComparisonTargetChange}
            loading={comparisonLoading}
            error={comparisonError}
            onRetry={handleComparisonRetry}
            insights={comparisonInsights}
            canUseAllOtherDays={hasDayOfWeekFilter}
          />
        </div>
      ) : null}

      {!compareMode && analytics ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-6 mb-8">
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
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
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
                  Qualified Rate: {renderWithBadge(qualifiedRateFormatted, qualifiedRateBadge)}
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
                  Close Rate: {renderWithBadge(closeRateFormatted, closeRateBadge)}
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
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
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
              value={<span className="text-red-600">{(analytics.missingPCNs || 0).toLocaleString()}</span>}
              description="Overdue PCN submissions"
              status="danger"
              onClick={createMetricCardHandler('missingPCNs', 'Missing PCNs')}
            />
                </div>
        </>
      ) : null}

      {analytics && (
        <>
          <div className="mb-6 flex gap-2">
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
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={overviewMode === 'charts' ? 'default' : 'outline'}
                  onClick={() => setOverviewMode('charts')}
                >
                  Charts
                </Button>
                <Button
                  variant={overviewMode === 'tables' ? 'default' : 'outline'}
                  onClick={() => setOverviewMode('tables')}
                >
                  Tables
                </Button>
              </div>

              {overviewMode === 'charts' ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                  <TimeSeriesLineChart
                    data={timeSeriesData}
                    onPointClick={(date) => handleSetDateRange(date)}
                  />
                  <DayOfWeekBarChart
                    data={dayOfWeekData}
                    onBarClick={(dayOfWeek) => handleAddFilter('dayOfWeek', String(dayOfWeek))}
                  />
                  <CalendarStackedBarChart
                    data={calendarChartData}
                    onBarClick={(calendar) => handleAddFilter('calendar', calendar)}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                  {renderBreakdownTable(
                    'By Day of Week',
                    dayOfWeekTable,
                    dayOfWeekColumns,
                    dayOfWeekComparisonMetrics,
                    (row) => row.dayName ?? DAY_NAMES[row.dayOfWeek as number] ?? 'Unknown day',
                    'analytics-by-day-of-week.csv',
                    (row) => {
                      if (row.dayOfWeek !== undefined) {
                        handleAddFilter('dayOfWeek', String(row.dayOfWeek))
                      }
                    },
                    'Search day…'
                  )}

                  {renderBreakdownTable(
                    'By Time of Day',
                    timeOfDayTable,
                    timeOfDayColumns,
                    timeOfDayComparisonMetrics,
                    (row) => row.period ?? 'Unknown period',
                    'analytics-by-time-of-day.csv',
                    (row) => {
                      const filterValue = row.period?.toLowerCase?.()
                      if (filterValue) {
                        handleAddFilter('timeOfDay', filterValue)
                      }
                    },
                    'Search period…'
                  )}

                  {renderBreakdownTable(
                    'First Call vs Follow Up',
                    appointmentTypeTable,
                    appointmentTypeColumns,
                    appointmentTypeComparisonMetrics,
                    (row) => row.type ?? 'Unknown type',
                    'analytics-by-appointment-type.csv',
                    (row) => {
                      const value =
                        row.type === 'First Call'
                          ? 'first_call'
                          : row.type === 'Follow Up'
                            ? 'follow_up'
                            : row.type
                      if (value) {
                        handleAddFilter('appointmentType', value)
                      }
                    },
                    'Search appointment type…'
                  )}
                </div>
              )}
            </div>
          )}
          
          {activeView === 'closers' && (
            <div>
              {renderBreakdownTable(
                'Performance by Closer',
                closerTable,
                closerColumns,
                closerComparisonMetrics,
                (row) => row.closerName ?? row.closerEmail ?? 'Unknown closer',
                'analytics-by-closer.csv',
                (row) => {
                  if (row.closerId) {
                    handleAddFilter('closer', row.closerId)
                  }
                },
                'Search closer…'
              )}
                </div>
          )}
          
          {activeView === 'calendars' && (
            <div>
              {renderBreakdownTable(
                'Performance by Calendar/Traffic Source',
                calendarTable,
                calendarColumns,
                calendarComparisonMetrics,
                (row) => row.calendar ?? 'Unknown calendar',
                'analytics-by-calendar.csv',
                (row) => {
                  if (row.calendar) {
                    handleAddFilter('calendar', row.calendar)
                  }
                },
                'Search calendar…'
              )}
                </div>
          )}
          
          {activeView === 'objections' && (
            <div>
              {renderBreakdownTable(
                'Objection Analysis',
                objectionTable,
                objectionColumns,
                objectionComparisonMetrics,
                (row) => row.type ?? 'Unknown objection',
                'analytics-by-objection.csv',
                (row) => {
                  if (row.type) {
                    handleAddFilter('objectionType', row.type)
                  }
                },
                'Search objection…'
              )}
                </div>
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
                    <div key={key} className="border rounded-md p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <p className="font-semibold text-base text-gray-900">
                            {item.contactName ||
                              item.saleId ||
                              item.appointmentId ||
                              `Record ${index + 1}`}
                          </p>
                          {item.contactEmail && (
                            <p className="text-sm text-gray-600">
                              {item.contactEmail}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                            <span>
                              <span className="font-medium">Closer:</span> {item.closerName || 'Unassigned'}
                            </span>
                            {item.scheduledAt && (
                              <span>
                                <span className="font-medium">Scheduled:</span> {formatDetailDate(item.scheduledAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.amount !== undefined && item.amount !== null && (
                          <p className="text-lg font-semibold text-gray-900">
                            ${Number(item.amount).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 border-t pt-2">
                        {item.type && <span>Type: {item.type}</span>}
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
                        <p className="text-sm text-gray-600 pt-1">Notes: {item.notes}</p>
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


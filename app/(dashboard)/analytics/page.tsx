'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import AdvancedFilters from '@/components/AdvancedFilters'

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
    fetchAnalytics()
  }, [])
  
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
    fetchAnalytics()
  }

  const handleFilterChange = (nextFilters: FilterState) => {
    setActiveQuickView(null)
    setFilters(nextFilters)
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
    setActiveQuickView(range)
    fetchAnalytics(updatedFilters)
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

  const createMetricCardHandlers = useCallback(
    (metricKey: string, title: string) => {
      const handleClick = () => fetchMetricDetails(metricKey, title)
      const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          fetchMetricDetails(metricKey, title)
        }
      }

      return {
        role: 'button' as const,
        tabIndex: 0,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        className:
          'cursor-pointer transition hover:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
      }
    },
    [fetchMetricDetails]
  )

  const formatSalesCycle = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return '—'
    }
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
      return '—'
    }
    return numeric.toFixed(1)
  }

  return (
    <>
      <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Sales Analytics</h1>
        <p className="text-gray-600">Deep dive into your sales performance</p>
        <p className="text-sm text-gray-500 mt-1">Reporting in {timezone}</p>
      </div>
      
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
            filters={filters}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <Card {...createMetricCardHandlers('callsCreated', 'Calls Created')}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Calls Created
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.callsCreated || 0}</div>
                <p className="text-xs text-gray-500 mt-1">
                  Appointments created in time frame
                </p>
              </CardContent>
            </Card>
            
            <Card {...createMetricCardHandlers('scheduledCallsToDate', 'Scheduled Calls to Date')}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Scheduled Calls to Date
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.scheduledCallsToDate || 0}</div>
                <p className="text-xs text-gray-500 mt-1">
                  Scheduled in time frame
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Cancellation Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.cancellationRate || 0}%</div>
                <p className="text-xs text-gray-500 mt-1">
                  Percent of scheduled calls canceled
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  No Show Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.noShowRate || 0}%</div>
                <p className="text-xs text-gray-500 mt-1">
                  Percent of expected calls that no-showed
                </p>
              </CardContent>
            </Card>
            
            <Card {...createMetricCardHandlers('salesCycle', 'Average Sales Cycle')}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Avg Sales Cycle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatSalesCycle(analytics.averageSalesCycleDays)}{' '}
                  {typeof analytics.averageSalesCycleDays === 'number' ? 'days' : ''}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Avg days from first call to close ({analytics.salesCycleCount || 0}{' '}
                  deals)
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Performance Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Show Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.showRate || 0}%</div>
                <p className="text-xs text-gray-500 mt-1">
                  {analytics.callsShown || 0} calls shown
                </p>
              </CardContent>
            </Card>
            
            <Card {...createMetricCardHandlers('qualifiedCalls', 'Qualified Calls')}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Qualified Calls
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.qualifiedCalls || 0}</div>
                <p className="text-xs text-gray-500 mt-1">
                  Qualified Rate: {analytics.qualifiedRate || 0}%
                </p>
              </CardContent>
            </Card>
            
            <Card {...createMetricCardHandlers('totalUnitsClosed', 'Total Units Closed')}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Units Closed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.totalUnitsClosed || 0}</div>
                <p className="text-xs text-gray-500 mt-1">
                  Close Rate: {analytics.closeRate || 0}%
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Scheduled Calls to Closed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{(analytics.scheduledCallsToClosed || 0).toFixed(1)}%</div>
                <p className="text-xs text-gray-500 mt-1">
                  Closed ÷ Scheduled
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Revenue Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card {...createMetricCardHandlers('cashCollected', 'Cash Collected')}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Cash Collected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${(analytics.cashCollected || 0).toLocaleString()}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Total cash collected
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  $ per Scheduled Call
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${parseFloat(analytics.dollarsOverScheduledCallsToDate || 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Cash ÷ Scheduled Calls
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  $ per Showed Call
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${parseFloat(analytics.dollarsOverShow || 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Cash ÷ Calls Shown
                </p>
              </CardContent>
            </Card>
            
            <Card {...createMetricCardHandlers('missingPCNs', 'Missing PCNs')}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Missing PCNs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {analytics.missingPCNs || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Overdue PCN submissions
                </p>
              </CardContent>
            </Card>
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
                          <th className="text-right py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byDayOfWeek?.map((day: any) => (
                          <tr key={day.dayName} className="border-b">
                            <td className="py-2">{day.dayName}</td>
                            <td className="text-right">{day.total}</td>
                            <td className="text-right">{day.showRate}%</td>
                            <td className="text-right">{day.closeRate}%</td>
                        <td className="text-right">
                          {formatSalesCycle(day.averageSalesCycleDays)}
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
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byTimeOfDay?.map((period: any) => (
                          <tr key={period.period} className="border-b">
                            <td className="py-2">{period.period}</td>
                            <td className="text-right">{period.total}</td>
                            <td className="text-right">{period.showRate}%</td>
                        <td className="text-right">{period.closeRate}%</td>
                        <td className="text-right">
                          {formatSalesCycle(period.averageSalesCycleDays)}
                        </td>
                          </tr>
                        ))}
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
                          <th className="text-right py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byAppointmentType?.map((type: any) => (
                          <tr key={type.type} className="border-b">
                            <td className="py-2">{type.type}</td>
                            <td className="text-right">{type.total}</td>
                            <td className="text-right">{type.showRate}%</td>
                            <td className="text-right">{type.closeRate}%</td>
                        <td className="text-right">
                          {formatSalesCycle(type.averageSalesCycleDays)}
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
                        <th className="text-right py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byCloser?.map((closer: any) => (
                        <tr key={closer.closerEmail} className="border-b">
                          <td className="py-2">{closer.closerName}</td>
                          <td className="text-right">{closer.total}</td>
                          <td className="text-right">{closer.showRate}%</td>
                          <td className="text-right">{closer.closeRate}%</td>
                          <td className="text-right">{closer.signed}</td>
                          <td className="text-right">
                            {formatSalesCycle(closer.averageSalesCycleDays)}
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
                        <th className="text-right py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byCalendar?.map((cal: any) => (
                        <tr key={cal.calendar} className="border-b">
                          <td className="py-2">{cal.calendar}</td>
                          <td className="text-right">{cal.total}</td>
                          <td className="text-right">{cal.showRate}%</td>
                          <td className="text-right">{cal.closeRate}%</td>
                          <td className="text-right">{cal.signed}</td>
                          <td className="text-right">
                            {formatSalesCycle(cal.averageSalesCycleDays)}
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
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byObjection?.map((obj: any) => (
                        <tr key={obj.type} className="border-b">
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


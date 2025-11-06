'use client'

import { useState, useEffect } from 'react'
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

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: '',
    dateTo: '',
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
  })
  
  const [analytics, setAnalytics] = useState<any>(null)
  const [closers, setClosers] = useState<any[]>([])
  const [calendars, setCalendars] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [activeView, setActiveView] = useState<'overview' | 'closers' | 'calendars' | 'objections'>('overview')
  
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
  
  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
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
    fetchAnalytics()
  }
  
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Sales Analytics</h1>
        <p className="text-gray-600">Deep dive into your sales performance</p>
      </div>
      
      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <AdvancedFilters
            filters={filters}
            onFilterChange={setFilters}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
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
            
            <Card>
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
            
            <Card>
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
            
            <Card>
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
            <Card>
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
            
            <Card>
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
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byTimeOfDay?.map((period: any) => (
                          <tr key={period.period} className="border-b">
                            <td className="py-2">{period.period}</td>
                            <td className="text-right">{period.total}</td>
                            <td className="text-right">{period.showRate}%</td>
                            <td className="text-right">{period.closeRate}%</td>
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
  )
}


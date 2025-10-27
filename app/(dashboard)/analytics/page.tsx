'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface FilterState {
  dateFrom: string
  dateTo: string
  closer: string
  status: string
  dayOfWeek: string
  trafficSource: string
  objectionType: string
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: '',
    dateTo: '',
    closer: '',
    status: '',
    dayOfWeek: '',
    trafficSource: '',
    objectionType: ''
  })
  
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  
  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      
      const res = await fetch(`/api/analytics?${params}`)
      const data = await res.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    }
    setLoading(false)
  }
  
  useEffect(() => {
    fetchAnalytics()
  }, [])
  
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Sales Analytics</h1>
      
      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">From Date</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">To Date</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full border rounded-md p-2"
              >
                <option value="">All</option>
                <option value="signed">Signed</option>
                <option value="showed">Showed</option>
                <option value="no_show">No Show</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Day of Week</label>
              <select
                value={filters.dayOfWeek}
                onChange={(e) => setFilters({...filters, dayOfWeek: e.target.value})}
                className="w-full border rounded-md p-2"
              >
                <option value="">All</option>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Objection Type</label>
              <select
                value={filters.objectionType}
                onChange={(e) => setFilters({...filters, objectionType: e.target.value})}
                className="w-full border rounded-md p-2"
              >
                <option value="">All</option>
                <option value="Price objection">Price</option>
                <option value="Partner objection">Partner</option>
                <option value="Timing">Timing</option>
                <option value="Value objection">Value</option>
                <option value="Cash on hand">Cash on Hand</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={fetchAnalytics} className="w-full" disabled={loading}>
                {loading ? 'Loading...' : 'Apply Filters'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Key Metrics */}
      {analytics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Appointments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.totalAppointments}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Show Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.showRate}%</div>
                <p className="text-sm text-gray-500 mt-1">
                  {analytics.showed} / {analytics.scheduled} showed up
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Close Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{analytics.closeRate}%</div>
                <p className="text-sm text-gray-500 mt-1">
                  {analytics.signed} / {analytics.showed} signed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${analytics.totalRevenue?.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>By Closer</CardTitle>
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
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byCloser?.map((closer: any) => (
                        <tr key={closer.closerEmail} className="border-b">
                          <td className="py-2">{closer.closerEmail}</td>
                          <td className="text-right">{closer.total}</td>
                          <td className="text-right">{closer.showRate}%</td>
                          <td className="text-right">{closer.closeRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            
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
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byDayOfWeek?.map((day: any) => (
                        <tr key={day.dayName} className="border-b">
                          <td className="py-2">{day.dayName}</td>
                          <td className="text-right">{day.total}</td>
                          <td className="text-right">{day.showRate}%</td>
                          <td className="text-right">{day.closeRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}


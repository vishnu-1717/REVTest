'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface MonitoringData {
  webhookStats: {
    total: number
    processed: number
    failed: number
    byProcessor: Record<string, { total: number; processed: number; failed: number }>
    recentErrors: Array<{
      id: string
      processor: string
      eventType: string
      error: string
      company: string
      createdAt: string
    }>
  }
  paymentStats: {
    totalSales: number
    matchedSales: number
    unmatchedPayments: number
    matchingRate: string
    recentUnmatched: Array<{
      id: string
      amount: number
      customerName: string
      customerEmail: string
      createdAt: string
    }>
  }
  companyStatuses: Array<{
    id: string
    name: string
    processor: string
    connected: boolean
    status: string
  }>
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/super-admin/monitoring')
      .then(res => res.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch monitoring data:', err)
        setLoading(false)
      })
  }, [])
  
  if (loading) return <div className="container mx-auto py-10">Loading...</div>
  if (!data) return <div className="container mx-auto py-10">Failed to load monitoring data</div>
  
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">System Monitoring</h1>
        <p className="text-gray-600">Monitor webhook health, payment matching, and integrations</p>
      </div>
      
      {/* Webhook Health */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Webhook Health (24 hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Events</p>
              <p className="text-3xl font-bold">{data.webhookStats.total}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Success Rate</p>
              <p className="text-3xl font-bold text-green-600">
                {data.webhookStats.total > 0 
                  ? ((data.webhookStats.processed / data.webhookStats.total) * 100).toFixed(1)
                  : '0'}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Failed</p>
              <p className="text-3xl font-bold text-red-600">{data.webhookStats.failed}</p>
            </div>
          </div>
          
          {/* By Processor */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">By Processor</p>
            <div className="space-y-2">
              {Object.entries(data.webhookStats.byProcessor).map(([processor, stats]) => (
                <div key={processor} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{processor}</span>
                  <div className="flex gap-4">
                    <span className="text-sm">{stats.total} total</span>
                    <Badge variant={stats.failed === 0 ? "default" : "destructive"}>
                      {stats.failed} failed
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Payment Matching */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Payment Matching</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Sales</p>
              <p className="text-3xl font-bold">{data.paymentStats.totalSales}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Matched</p>
              <p className="text-3xl font-bold text-green-600">{data.paymentStats.matchedSales}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Match Rate</p>
              <p className="text-3xl font-bold">{data.paymentStats.matchingRate}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Unmatched</p>
              <p className="text-3xl font-bold text-yellow-600">{data.paymentStats.unmatchedPayments}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Company Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle>Company Integration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Company</th>
                  <th className="text-left py-2">Processor</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.companyStatuses.map((company) => (
                  <tr key={company.id} className="border-b">
                    <td className="py-2">{company.name}</td>
                    <td className="py-2 text-sm text-gray-600">{company.processor}</td>
                    <td className="py-2">
                      <Badge variant={company.connected ? "default" : "destructive"}>
                        {company.connected ? 'Connected' : 'Not Connected'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


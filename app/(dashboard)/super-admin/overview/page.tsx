'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface SystemOverview {
  totalCompanies: number
  totalUsers: number
  totalAppointments: number
  totalRevenue: number
  activeCompanies: number
  webhookHealth: {
    total: number
    processed: number
    failed: number
    successRate: string
    failureRate: string
  }
  paymentStats: {
    totalSales: number
    matchedSales: number
    unmatchedPayments: number
    matchingRate: string
    averageConfidence: string
  }
  errorCount: number
}

export default function SystemOverviewPage() {
  const [data, setData] = useState<SystemOverview | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/super-admin/overview')
      .then(res => res.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch system overview:', err)
        setLoading(false)
      })
  }, [])
  
  if (loading) return <div className="container mx-auto py-10">Loading...</div>
  if (!data) return <div className="container mx-auto py-10">Failed to load system overview</div>
  
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">System Overview</h1>
        <p className="text-gray-600">Monitor your entire platform's health and activity</p>
      </div>
      
      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.totalCompanies}</div>
            <p className="text-xs text-gray-500 mt-1">
              {data.activeCompanies} active
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.totalUsers}</div>
            <p className="text-xs text-gray-500 mt-1">
              Across all companies
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.totalAppointments}</div>
            <p className="text-xs text-gray-500 mt-1">
              All-time
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
              ${data.totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Across all companies
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Errors (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{data.errorCount}</div>
            <p className="text-xs text-gray-500 mt-1">
              Webhook & processing errors
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* System Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Webhook Health (24 hours)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Events</span>
                <span className="font-semibold">{data.webhookHealth.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Success Rate</span>
                <Badge variant={parseFloat(data.webhookHealth.successRate) > 95 ? 'default' : 'destructive'}>
                  {data.webhookHealth.successRate}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Processed</span>
                <span className="font-semibold text-green-600">{data.webhookHealth.processed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Failed</span>
                <span className="font-semibold text-red-600">{data.webhookHealth.failed}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Payment Matching Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Sales</span>
                <span className="font-semibold">{data.paymentStats.totalSales}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Match Rate</span>
                <Badge variant={parseFloat(data.paymentStats.matchingRate) > 90 ? 'default' : 'destructive'}>
                  {data.paymentStats.matchingRate}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Matched</span>
                <span className="font-semibold text-green-600">{data.paymentStats.matchedSales}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Unmatched</span>
                <span className="font-semibold text-yellow-600">{data.paymentStats.unmatchedPayments}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


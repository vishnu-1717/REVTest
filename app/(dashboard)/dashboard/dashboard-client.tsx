'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import Leaderboard from '@/components/Leaderboard'

interface Stats {
  totalAppointments: number
  scheduled: number
  showed: number
  signed: number
  noShows: number
  showRate: number
  closeRate: number
  totalRevenue: number
  totalCommissions?: number
  pendingCommissions?: number
  releasedCommissions?: number
  paidCommissions?: number
  followUpsNeeded?: number
  redzoneFollowUps?: number
  recentAppointments: any[]
  recentCommissions?: any[]
  // Company admin specific fields
  averageDealSize?: number
  activeRepsCount?: number
  topPerformer?: any
  repStats?: any[]
}

interface DashboardPageClientProps {
  userRole: string
  isCompanyAdmin: boolean
  isSuperAdmin: boolean
}

export default function DashboardClient({ userRole, isCompanyAdmin, isSuperAdmin }: DashboardPageClientProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30') // days
  
  useEffect(() => {
    fetchStats()
  }, [dateRange, isCompanyAdmin])
  
  const fetchStats = async () => {
    try {
      const dateFrom = new Date()
      dateFrom.setDate(dateFrom.getDate() - parseInt(dateRange))
      
      const params = new URLSearchParams({
        dateFrom: dateFrom.toISOString()
      })
      
      // Use different endpoint based on role
      const endpoint = isCompanyAdmin ? '/api/admin/company-stats' : '/api/rep/stats'
      const res = await fetch(`${endpoint}?${params}`)
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
    setLoading(false)
  }
  
  if (loading || !stats) {
    return <div className="container mx-auto py-10">Loading...</div>
  }
  
  return (
    <div className="container mx-auto py-10 max-w-7xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            {isCompanyAdmin ? 'Company Dashboard' : 'My Dashboard'}
          </h1>
          <p className="text-gray-500">
            {isCompanyAdmin ? 'Your team\'s performance overview' : 'Your personal performance overview'}
          </p>
        </div>
        
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>
      </div>
      
      {/* Action Items */}
      {stats.followUpsNeeded && stats.followUpsNeeded > 0 && (
        <Card className="mb-8 border-yellow-200 bg-yellow-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-yellow-900">
                  ⚡ You have {stats.followUpsNeeded} follow-ups needed
                </p>
                <p className="text-sm text-yellow-700">
                  {stats.redzoneFollowUps} in the redzone (within 7 days)
                </p>
              </div>
              <Button className="bg-yellow-600 hover:bg-yellow-700">
                View Follow-ups
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              {isCompanyAdmin ? 'Team Appointments' : 'My Appointments'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalAppointments}</div>
            <div className="text-sm text-gray-500 mt-1">
              <span className="text-green-600">{stats.signed} closed</span>
              {' · '}
              <span className="text-red-600">{stats.noShows} no-shows</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              {isCompanyAdmin ? 'Team Show Rate' : 'My Show Rate'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.showRate}%</div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.showed} / {stats.scheduled} showed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              {isCompanyAdmin ? 'Team Close Rate' : 'My Close Rate'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.closeRate}%</div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.signed} / {stats.showed} closed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              {isCompanyAdmin ? 'Company Revenue' : 'My Revenue'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${stats.totalRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Commission Tracker - Only for Sales Reps */}
      {!isCompanyAdmin && stats.totalCommissions !== undefined && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>💰 Commission Tracker</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Earned</p>
                <p className="text-2xl font-bold">
                  ${stats.totalCommissions.toLocaleString()}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  ${stats.pendingCommissions?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-gray-500">Waiting on payments</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">Released</p>
                <p className="text-2xl font-bold text-blue-600">
                  ${stats.releasedCommissions?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-gray-500">Ready for payout</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">Paid</p>
                <p className="text-2xl font-bold text-green-600">
                  ${stats.paidCommissions?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-gray-500">In your account</p>
              </div>
            </div>
            
            <div className="mt-6">
              <Link
                href="/commissions"
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View detailed commission breakdown →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company Admin: Team Stats */}
      {isCompanyAdmin && stats.activeRepsCount !== undefined && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Active Reps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.activeRepsCount}</div>
            </CardContent>
          </Card>
          
          {stats.averageDealSize !== undefined && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Average Deal Size
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ${stats.averageDealSize.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          )}
          
          {stats.topPerformer && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-600">
                  Top Performer This Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.topPerformer.name}</div>
                <p className="text-sm text-gray-500 mt-1">
                  ${stats.topPerformer.revenue.toLocaleString()} in {stats.topPerformer.appointments} appointments
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Appointments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentAppointments.length === 0 ? (
              <p className="text-gray-500 text-sm">No appointments yet</p>
            ) : (
              <div className="space-y-3">
                {stats.recentAppointments.map((apt: any) => (
                  <div key={apt.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div className="flex-1">
                      <p className="font-medium">{apt.contact?.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(apt.scheduledAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        apt.status === 'signed' 
                          ? 'bg-green-100 text-green-800'
                          : apt.status === 'showed'
                          ? 'bg-blue-100 text-blue-800'
                          : apt.status === 'no_show'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {apt.status.replace('_', ' ')}
                      </span>
                      {apt.cashCollected && (
                        <p className="text-sm font-semibold mt-1">
                          ${apt.cashCollected.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Recent Commissions - Only for Sales Reps */}
        {!isCompanyAdmin && stats.recentCommissions && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Commissions</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentCommissions.length === 0 ? (
                <p className="text-gray-500 text-sm">No commissions yet</p>
              ) : (
                <div className="space-y-3">
                  {stats.recentCommissions.map((com: any) => (
                    <div key={com.id} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div className="flex-1">
                        <p className="font-medium">
                          ${com.totalAmount.toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(com.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          com.releaseStatus === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : com.releaseStatus === 'released'
                            ? 'bg-blue-100 text-blue-800'
                            : com.releaseStatus === 'partial'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {com.releaseStatus}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          {(com.percentage * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Leaderboard */}
      <div className="mt-8">
        <Leaderboard />
      </div>
    </div>
  )
}


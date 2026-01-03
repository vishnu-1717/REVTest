'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import Leaderboard from '@/components/Leaderboard'
import { PendingPCNsWidget } from '@/components/PendingPCNsWidget'
import { PCNStatus } from '@/components/PCNStatus'
import { Zap, DollarSign, BarChart2 } from 'lucide-react'

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

const getViewAsCompany = () => {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const viewAsParam = params.get('viewAs')
  if (viewAsParam) return viewAsParam
  const match = document.cookie.match(/(?:^|;)\s*view_as_company=([^;]+)/)
  const value = match ? decodeURIComponent(match[1]) : null
  if (value === 'none') return null
  return value
}

export default function DashboardClient({ userRole, isCompanyAdmin, isSuperAdmin }: DashboardPageClientProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30') // days

  const withViewAs = useCallback((url: string) => {
    const viewAs = getViewAsCompany()
    if (!viewAs) return url
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}viewAs=${viewAs}`
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const dateFrom = new Date()
      dateFrom.setDate(dateFrom.getDate() - parseInt(dateRange))

      const params = new URLSearchParams({
        dateFrom: dateFrom.toISOString()
      })

      // Use different endpoint based on role
      const endpoint = isCompanyAdmin ? '/api/admin/company-stats' : '/api/rep/stats'
      const url = `${endpoint}?${params}`
      const res = await fetch(isCompanyAdmin ? withViewAs(url) : url, {
        credentials: 'include'
      })
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
    setLoading(false)
  }, [dateRange, isCompanyAdmin, withViewAs])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading || !stats) {
    return <div className="mx-auto max-w-6xl px-4 py-6"><div className="text-gray-700">Loading...</div></div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
            {isCompanyAdmin ? 'Company Dashboard' : 'My Dashboard'}
          </h1>
          <p className="text-sm text-gray-700 mt-1">
            {isCompanyAdmin ? 'Your team\'s performance overview' : 'Your personal performance overview'}
          </p>
        </div>

        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-amber-800 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" />
                You have {stats.followUpsNeeded} follow-ups needed
              </p>
              <p className="text-sm text-amber-700 mt-1 pl-6">
                {stats.redzoneFollowUps} in the redzone (within 7 days)
              </p>
            </div>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white border border-amber-500">
              View Follow-ups
            </Button>
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="card-premium group">
          <p className="metric-label mb-3">
            {isCompanyAdmin ? 'Team Appointments' : 'My Appointments'}
          </p>
          <p className="metric-value text-foreground mb-3">
            {stats.totalAppointments.toLocaleString()}
          </p>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {stats.signed} closed
            </span>
            <span className="inline-flex items-center gap-1 text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
              {stats.noShows} no-shows
            </span>
          </div>
        </div>

        <div className="card-premium group">
          <p className="metric-label mb-3">
            {isCompanyAdmin ? 'Team Show Rate' : 'My Show Rate'}
          </p>
          <p className={`metric-value mb-3 ${stats.showRate >= 70 ? 'text-emerald-600' : stats.showRate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
            {stats.showRate}%
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.showed} / {stats.scheduled} showed
          </p>
        </div>

        <div className="card-premium group">
          <p className="metric-label mb-3">
            {isCompanyAdmin ? 'Team Close Rate' : 'My Close Rate'}
          </p>
          <p className={`metric-value mb-3 ${stats.closeRate >= 30 ? 'text-emerald-600' : stats.closeRate >= 15 ? 'text-amber-600' : 'text-foreground'}`}>
            {stats.closeRate}%
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.signed} / {stats.showed} closed
          </p>
        </div>

        <div className="card-premium group">
          <p className="metric-label mb-3">
            {isCompanyAdmin ? 'Company Revenue' : 'My Revenue'}
          </p>
          <p className="metric-value text-foreground">
            ${stats.totalRevenue.toLocaleString()}
          </p>
        </div>
      </section>

      {/* Pending PCNs Widget */}
      <div className="mb-6">
        <PendingPCNsWidget />
      </div>

      {/* Commission Tracker - Only for Sales Reps */}
      {!isCompanyAdmin && stats.totalCommissions !== undefined && (
        <div className="card-premium mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-amber-600" />
              </div>
              <h2 className="section-title">Commission Tracker</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="metric-label mb-2">Total Earned</p>
              <p className="text-2xl font-bold text-foreground tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.totalCommissions.toLocaleString()}
              </p>
            </div>

            <div>
              <p className="metric-label mb-2">Pending</p>
              <p className="text-2xl font-bold text-amber-600 tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.pendingCommissions?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Waiting on payments</p>
            </div>

            <div>
              <p className="metric-label mb-2">Released</p>
              <p className="text-2xl font-bold text-blue-600 tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.releasedCommissions?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Ready for payout</p>
            </div>

            <div>
              <p className="metric-label mb-2">Paid</p>
              <p className="text-2xl font-bold text-emerald-600 tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.paidCommissions?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">In your account</p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border/40">
            <Link
              href="/commissions"
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              View detailed commission breakdown →
            </Link>
          </div>
        </div>
      )}

      {/* Company Admin: Team Stats */}
      {isCompanyAdmin && stats.activeRepsCount !== undefined && (
        <section className="grid gap-4 md:grid-cols-3 mb-8">
          <div className="card-premium">
            <p className="metric-label mb-3">Active Reps</p>
            <p className="metric-value text-foreground">
              {stats.activeRepsCount}
            </p>
          </div>

          {stats.averageDealSize !== undefined && (
            <div className="card-premium">
              <p className="metric-label mb-3">Average Deal Size</p>
              <p className="metric-value text-foreground">
                ${stats.averageDealSize.toLocaleString()}
              </p>
            </div>
          )}

          {stats.topPerformer && (
            <div className="card-premium">
              <p className="metric-label mb-3">Top Performer This Month</p>
              <p className="text-lg font-semibold text-foreground mb-1">{stats.topPerformer.name}</p>
              <p className="text-xs text-muted-foreground">
                ${stats.topPerformer.revenue.toLocaleString()} in {stats.topPerformer.appointments} appointments
              </p>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2 mb-8">
        {/* Recent Appointments */}
        <div className="card-premium">
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title">Recent Appointments</h2>
          </div>
          <div className="overflow-x-auto">
            {stats.recentAppointments.length === 0 ? (
              <p className="text-muted-foreground text-sm">No appointments yet</p>
            ) : (
              <div className="space-y-2">
                {stats.recentAppointments.map((apt: any) => (
                  <div key={apt.id} className="flex justify-between items-start py-3 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{apt.contact?.name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(apt.scheduledAt).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {apt.closer && (
                          <span className="text-xs text-muted-foreground">
                            {apt.closer.name}
                          </span>
                        )}
                        {apt.calendarRelation && (
                          <span className="text-xs text-primary/70">
                            {apt.calendarRelation.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right space-y-2 ml-3 flex-shrink-0">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${apt.status === 'signed'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : apt.status === 'showed'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : apt.status === 'no_show'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                        {apt.status.replace('_', ' ')}
                      </span>
                      {apt.cashCollected && (
                        <p className="text-sm font-semibold text-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          ${apt.cashCollected.toLocaleString()}
                        </p>
                      )}
                      <div className="flex justify-end">
                        <PCNStatus
                          appointmentId={apt.id}
                          pcnSubmitted={apt.pcnSubmitted || false}
                          pcnSubmittedAt={apt.pcnSubmittedAt || null}
                          scheduledAt={apt.scheduledAt}
                          status={apt.status}
                          showButton={true}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Commissions - Only for Sales Reps */}
        {!isCompanyAdmin && stats.recentCommissions && (
          <div className="card-premium">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title">Recent Commissions</h2>
            </div>
            <div className="overflow-x-auto">
              {stats.recentCommissions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No commissions yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentCommissions.map((com: any) => (
                    <div key={com.id} className="flex justify-between items-center py-3 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <p className="font-medium text-foreground text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          ${com.totalAmount.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(com.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${com.releaseStatus === 'paid'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : com.releaseStatus === 'released'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : com.releaseStatus === 'partial'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                          {com.releaseStatus}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(com.percentage * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Leaderboard */}
      <div className="mt-6">
        <Leaderboard />
      </div>
    </div>
  )
}


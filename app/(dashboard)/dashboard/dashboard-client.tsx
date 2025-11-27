'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import Leaderboard from '@/components/Leaderboard'
import { PendingPCNsWidget } from '@/components/PendingPCNsWidget'
import { PCNStatus } from '@/components/PCNStatus'

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
    return <div className="mx-auto max-w-6xl px-4 py-6"><div className="text-slate-300">Loading...</div></div>
  }
  
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100">
            {isCompanyAdmin ? 'Company Dashboard' : 'My Dashboard'}
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            {isCompanyAdmin ? 'Your team\'s performance overview' : 'Your personal performance overview'}
          </p>
        </div>
        
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-6 py-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-amber-300">
                ⚡ You have {stats.followUpsNeeded} follow-ups needed
              </p>
              <p className="text-sm text-amber-200/70 mt-1">
                {stats.redzoneFollowUps} in the redzone (within 7 days)
              </p>
            </div>
            <Button className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30">
              View Follow-ups
            </Button>
          </div>
        </div>
      )}
      
      {/* Performance Metrics */}
      <section className="grid gap-4 md:grid-cols-4 mb-8">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 transition-shadow duration-200 hover:shadow-lg hover:shadow-black/20">
          <p className="text-sm font-medium text-slate-300 mb-2">
            {isCompanyAdmin ? 'Team Appointments' : 'My Appointments'}
          </p>
          <p className="text-3xl font-bold text-slate-100 mb-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {stats.totalAppointments.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400">
            <span className="text-emerald-300">{stats.signed} closed</span>
            {' · '}
            <span className="text-red-300">{stats.noShows} no-shows</span>
          </p>
        </div>
        
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 transition-shadow duration-200 hover:shadow-lg hover:shadow-black/20">
          <p className="text-sm font-medium text-slate-300 mb-2">
            {isCompanyAdmin ? 'Team Show Rate' : 'My Show Rate'}
          </p>
          <p className="text-3xl font-bold text-slate-100 mb-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {stats.showRate}%
          </p>
          <p className="text-xs text-slate-400">
            {stats.showed} / {stats.scheduled} showed
          </p>
        </div>
        
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 transition-shadow duration-200 hover:shadow-lg hover:shadow-black/20">
          <p className="text-sm font-medium text-slate-300 mb-2">
            {isCompanyAdmin ? 'Team Close Rate' : 'My Close Rate'}
          </p>
          <p className="text-3xl font-bold text-slate-100 mb-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {stats.closeRate}%
          </p>
          <p className="text-xs text-slate-400">
            {stats.signed} / {stats.showed} closed
          </p>
        </div>
        
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 transition-shadow duration-200 hover:shadow-lg hover:shadow-black/20">
          <p className="text-sm font-medium text-slate-300 mb-2">
            {isCompanyAdmin ? 'Company Revenue' : 'My Revenue'}
          </p>
          <p className="text-3xl font-bold text-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">💰 Commission Tracker</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Total Earned</p>
              <p className="text-2xl font-bold text-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.totalCommissions.toLocaleString()}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Pending</p>
              <p className="text-2xl font-bold text-amber-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.pendingCommissions?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">Waiting on payments</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Released</p>
              <p className="text-2xl font-bold text-blue-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.releasedCommissions?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">Ready for payout</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Paid</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.paidCommissions?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">In your account</p>
            </div>
          </div>
          
          <div className="mt-6">
            <Link
              href="/commissions"
              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              View detailed commission breakdown →
            </Link>
          </div>
        </div>
      )}

      {/* Company Admin: Team Stats */}
      {isCompanyAdmin && stats.activeRepsCount !== undefined && (
        <section className="grid gap-4 md:grid-cols-3 mb-8">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 transition-shadow duration-200 hover:shadow-lg hover:shadow-black/20">
            <p className="text-sm font-medium text-slate-300 mb-2">Active Reps</p>
            <p className="text-3xl font-bold text-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {stats.activeRepsCount}
            </p>
          </div>
          
          {stats.averageDealSize !== undefined && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 transition-shadow duration-200 hover:shadow-lg hover:shadow-black/20">
              <p className="text-sm font-medium text-slate-300 mb-2">Average Deal Size</p>
              <p className="text-3xl font-bold text-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${stats.averageDealSize.toLocaleString()}
              </p>
            </div>
          )}
          
          {stats.topPerformer && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 transition-shadow duration-200 hover:shadow-lg hover:shadow-black/20">
              <p className="text-sm font-medium text-slate-300 mb-2">Top Performer This Month</p>
              <p className="text-xl font-bold text-slate-100 mb-1">{stats.topPerformer.name}</p>
              <p className="text-xs text-slate-400">
                ${stats.topPerformer.revenue.toLocaleString()} in {stats.topPerformer.appointments} appointments
              </p>
            </div>
          )}
        </section>
      )}
      
      <section className="grid gap-6 md:grid-cols-2 mb-8">
        {/* Recent Appointments */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Recent Appointments</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            {stats.recentAppointments.length === 0 ? (
              <p className="text-slate-400 text-sm">No appointments yet</p>
            ) : (
              <div className="space-y-3">
                {stats.recentAppointments.map((apt: any, index: number) => (
                  <div key={apt.id} className={`flex justify-between items-start py-3 px-2 rounded-lg ${index % 2 === 0 ? 'bg-slate-900/30' : ''} border-b border-slate-700/30 last:border-0`}>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-100 mb-1">{apt.contact?.name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400 mb-2">
                        {new Date(apt.scheduledAt).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {apt.setter && (
                          <span className="text-xs text-blue-300">
                            Setter: {apt.setter.name}
                          </span>
                        )}
                        {apt.closer && (
                          <span className="text-xs text-emerald-300">
                            Closer: {apt.closer.name}
                          </span>
                        )}
                        {apt.calendarRelation && (
                          <span className="text-xs text-purple-300">
                            {apt.calendarRelation.name}
                          </span>
                        )}
                        {apt.attributionSource && (
                          <span className="text-xs text-amber-300">
                            📊 {apt.attributionSource}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right space-y-2 ml-4">
                      <span className={`px-2.5 py-1 text-xs rounded-md font-medium ${
                        apt.status === 'signed' 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : apt.status === 'showed'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : apt.status === 'no_show'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                      }`}>
                        {apt.status.replace('_', ' ')}
                      </span>
                      {apt.cashCollected && (
                        <p className="text-sm font-bold text-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Recent Commissions</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              {stats.recentCommissions.length === 0 ? (
                <p className="text-slate-400 text-sm">No commissions yet</p>
              ) : (
                <div className="space-y-3">
                  {stats.recentCommissions.map((com: any, index: number) => (
                    <div key={com.id} className={`flex justify-between items-center py-3 px-2 rounded-lg ${index % 2 === 0 ? 'bg-slate-900/30' : ''} border-b border-slate-700/30 last:border-0`}>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-100 mb-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          ${com.totalAmount.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(com.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <span className={`px-2.5 py-1 text-xs rounded-md font-medium ${
                          com.releaseStatus === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : com.releaseStatus === 'released'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : com.releaseStatus === 'partial'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                        }`}>
                          {com.releaseStatus}
                        </span>
                        <p className="text-xs text-slate-400 mt-1">
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


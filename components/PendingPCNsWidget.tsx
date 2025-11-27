'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PendingPCNCloserSummary, PendingPCNsResponse } from '@/types/pcn'
import { formatMinutesOverdue } from '@/lib/utils'

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

const withViewAs = (url: string) => {
  const viewAs = getViewAsCompany()
  if (!viewAs) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}viewAs=${viewAs}`
}

export function PendingPCNsWidget() {
  const router = useRouter()
  const [closerSummaries, setCloserSummaries] = useState<PendingPCNCloserSummary[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [timezone, setTimezone] = useState('UTC')

  const filteredSummaries = useMemo(
    () => closerSummaries.filter((summary) => summary.pendingCount > 0),
    [closerSummaries]
  )

  const hasPending = totalCount > 0 || filteredSummaries.length > 0

  const fetchPending = useCallback(async () => {
    try {
      const response = await fetch(withViewAs('/api/appointments/pending-pcns?groupBy=closer'))
      const data: PendingPCNsResponse = await response.json()
      setCloserSummaries(data.byCloser || [])
      setTotalCount(
        data.totalCount ||
          data.byCloser?.reduce((sum, closer) => sum + closer.pendingCount, 0) ||
          0
      )
      if (data.timezone) {
        setTimezone(data.timezone)
      }
    } catch (error) {
      console.error('Failed to fetch pending PCNs:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPending()

    const interval = setInterval(fetchPending, 60000)
    return () => clearInterval(interval)
  }, [fetchPending])

  const getUrgencyStyles = useCallback((level: 'normal' | 'medium' | 'high') => {
    switch (level) {
      case 'high':
        return 'border-red-500/20 bg-red-500/10 text-red-300'
      case 'medium':
        return 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      default:
        return 'border-blue-500/20 bg-blue-500/10 text-blue-300'
    }
  }, [])

  const hasUrgent = useMemo(
    () =>
      closerSummaries.some(
        (summary) => summary.urgencyLevel === 'high' && summary.pendingCount > 0
      ),
    [closerSummaries]
  )

  const handleNavigateToCloser = useCallback(
    (closerId: string | null) => {
      const value = closerId ?? 'unassigned'
      router.push(`/appointments?closerId=${encodeURIComponent(value)}`)
    },
    [router]
  )

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Pending Post-Call Notes</h2>
        </div>
      </div>
      <div>
        {loading ? (
          <p className="text-slate-300 text-sm">Loading...</p>
        ) : !hasPending ? (
          <div className="text-center py-4">
            <p className="text-emerald-300 font-semibold">Everything is up to date! 🎉</p>
            <p className="text-slate-300 text-sm mt-1">No pending post-call notes.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-slate-200 font-medium">{totalCount} pending</span>
              {hasUrgent && <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Urgent!</Badge>}
              <span className="text-xs text-slate-400 ml-auto">Time zone: {timezone}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSummaries.map((summary) => (
                <button
                  type="button"
                  key={summary.closerId ?? 'unassigned'}
                  className={`rounded-lg border p-4 text-left transition hover:shadow-md ${
                    summary.pendingCount > 0
                      ? getUrgencyStyles(summary.urgencyLevel)
                      : 'border-slate-700/50 bg-slate-900/30 text-slate-400 hover:bg-slate-900/50'
                  }`}
                  onClick={() => handleNavigateToCloser(summary.closerId)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        {summary.closerName}
                        {summary.pendingCount === 0 && ' ✅'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {summary.pendingCount === 0
                          ? 'All PCNs submitted'
                          : `${summary.pendingCount} missing PCN${
                              summary.pendingCount === 1 ? '' : 's'
                            }`}
                      </p>
                    </div>
                    {summary.pendingCount > 0 && (
                      <span className="text-lg font-bold text-slate-200" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {summary.pendingCount}
                      </span>
                    )}
                  </div>
                  {summary.pendingCount > 0 && summary.oldestMinutes !== null && (
                    <p className="mt-3 text-xs text-slate-400">
                      Oldest outstanding: {formatMinutesOverdue(summary.oldestMinutes)} ago
                    </p>
                  )}
                </button>
              ))}
            </div>

            <div className="text-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/appointments')}
                className="text-xs border-slate-700/50 text-slate-300 hover:bg-slate-700/50"
              >
                View all team PCNs
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


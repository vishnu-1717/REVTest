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
        return 'border-red-300 bg-red-50 text-red-700'
      case 'medium':
        return 'border-amber-300 bg-amber-50 text-amber-700'
      default:
        return 'border-blue-300 bg-blue-50 text-blue-700'
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
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Pending Post-Call Notes</h2>
        </div>
      </div>
      <div>
        {loading ? (
          <p className="text-gray-700 text-sm">Loading...</p>
        ) : !hasPending ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 mb-3">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">All caught up</p>
            <p className="text-xs text-muted-foreground mt-1">No pending post-call notes</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-700 font-medium">{totalCount} pending</span>
              {hasUrgent && <Badge className="bg-red-100 text-red-700 border-red-300">Urgent!</Badge>}
              <span className="text-xs text-gray-600 ml-auto">Time zone: {timezone}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSummaries.map((summary) => (
                <button
                  type="button"
                  key={summary.closerId ?? 'unassigned'}
                  className={`rounded-lg border p-4 text-left transition hover:shadow-md ${
                    summary.pendingCount > 0
                      ? getUrgencyStyles(summary.urgencyLevel)
                      : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => handleNavigateToCloser(summary.closerId)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        {summary.closerName}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {summary.pendingCount === 0
                          ? 'All PCNs submitted'
                          : `${summary.pendingCount} missing PCN${
                              summary.pendingCount === 1 ? '' : 's'
                            }`}
                      </p>
                    </div>
                    {summary.pendingCount > 0 && (
                      <span className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {summary.pendingCount}
                      </span>
                    )}
                  </div>
                  {summary.pendingCount > 0 && summary.oldestMinutes !== null && (
                    <p className="mt-3 text-xs text-gray-600">
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
                className="text-xs border-gray-300 text-gray-700 hover:bg-gray-100"
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


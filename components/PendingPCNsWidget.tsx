'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PendingPCNCloserSummary, PendingPCNsResponse } from '@/types/pcn'
import { formatMinutesOverdue } from '@/lib/utils'

const INACTIVE_CLOSER_ID = '__inactive__'

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
        return 'border-red-200 bg-red-50 text-red-700'
      case 'medium':
        return 'border-yellow-200 bg-yellow-50 text-yellow-700'
      default:
        return 'border-blue-100 bg-blue-50 text-blue-700'
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
      if (closerId === INACTIVE_CLOSER_ID) {
        router.push('/appointments?closerId=inactive')
        return
      }
      const value = closerId ?? 'unassigned'
      router.push(`/appointments?closerId=${encodeURIComponent(value)}`)
    },
    [router]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Post-Call Notes</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : !hasPending ? (
          <div className="text-center py-4">
            <p className="text-green-600 font-semibold">Everything is up to date! 🎉</p>
            <p className="text-gray-500 text-sm mt-1">No pending post-call notes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-600">{totalCount} pending</span>
              {hasUrgent && <Badge className="bg-red-500 text-white">Urgent!</Badge>}
              <span className="text-xs text-gray-400 ml-auto">Time zone: {timezone}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSummaries.map((summary) => {
                const summaryKey =
                  summary.closerId === INACTIVE_CLOSER_ID
                    ? 'inactive'
                    : summary.closerId ?? 'unassigned'
                const subtitle =
                  summary.pendingCount === 0
                    ? 'All PCNs submitted'
                    : summary.closerId === INACTIVE_CLOSER_ID
                      ? `${summary.pendingCount} missing PCNs (inactive/hidden reps)`
                      : `${summary.pendingCount} missing PCN${
                          summary.pendingCount === 1 ? '' : 's'
                        }`
                return (
                  <button
                    type="button"
                    key={summaryKey}
                    className={`rounded-lg border p-4 text-left transition hover:shadow-sm ${
                      summary.pendingCount > 0
                        ? getUrgencyStyles(summary.urgencyLevel)
                        : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                    onClick={() => handleNavigateToCloser(summary.closerId)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          {summary.closerName}
                          {summary.pendingCount === 0 && ' ✅'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
                      </div>
                      {summary.pendingCount > 0 && (
                        <span className="text-lg font-bold text-gray-700">
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
                )
              })}
            </div>

            <div className="text-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/appointments')}
                className="text-xs"
              >
                View all team PCNs
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


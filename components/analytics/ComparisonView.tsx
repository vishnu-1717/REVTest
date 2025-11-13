'use client'

import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Insight } from '@/lib/analytics-insights'
import { ComparisonTargetSelector } from './ComparisonTargetSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ComparisonTarget } from '@/lib/analytics-comparison'

type NullableNumber = number | null | undefined

interface ComparisonViewProps {
  primaryLabel?: string
  primaryData: Record<string, any> | null
  comparisonData: Record<string, any> | null
  comparisonLabel: string
  comparisonTarget: ComparisonTarget
  onTargetChange: (target: ComparisonTarget) => void
  loading: boolean
  error: string | null
  onRetry?: () => void
  insights: Insight[]
  canUseAllOtherDays: boolean
}

interface MetricConfig {
  key: string
  label: string
  format: (value: NullableNumber) => string
  higherIsBetter?: boolean
}

const metrics: MetricConfig[] = [
  {
    key: 'scheduledCallsToDate',
    label: 'Scheduled Calls',
    format: (value) => (value ?? 0).toLocaleString()
  },
  {
    key: 'showRate',
    label: 'Show Rate',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—',
    higherIsBetter: true
  },
  {
    key: 'qualifiedRate',
    label: 'Qualified Rate',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—',
    higherIsBetter: true
  },
  {
    key: 'closeRate',
    label: 'Close Rate',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—',
    higherIsBetter: true
  },
  {
    key: 'cancellationRate',
    label: 'Cancellation Rate',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—',
    higherIsBetter: false
  },
  {
    key: 'noShowRate',
    label: 'No-show Rate',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—',
    higherIsBetter: false
  },
  {
    key: 'totalUnitsClosed',
    label: 'Units Closed',
    format: (value) => (value ?? 0).toLocaleString(),
    higherIsBetter: true
  },
  {
    key: 'cashCollected',
    label: 'Cash Collected',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value)
        ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 0 })}`
        : '$0',
    higherIsBetter: true
  },
  {
    key: 'dollarsOverScheduledCallsToDate',
    label: '$ Per Scheduled Call',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value)
        ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0.00',
    higherIsBetter: true
  },
  {
    key: 'dollarsOverShow',
    label: '$ Per Showed Call',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value)
        ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0.00',
    higherIsBetter: true
  },
  {
    key: 'averageSalesCycleDays',
    label: 'Avg Sales Cycle (days)',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—',
    higherIsBetter: false
  },
  {
    key: 'averageAppointmentLeadTimeDays',
    label: 'Avg Lead Time (days)',
    format: (value) =>
      typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—',
    higherIsBetter: false
  }
]

const getNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return null
}

const DeltaBadge = ({
  primary,
  comparison,
  higherIsBetter = true
}: {
  primary: NullableNumber
  comparison: NullableNumber
  higherIsBetter?: boolean
}) => {
  const primaryValue = getNumber(primary)
  const comparisonValue = getNumber(comparison)

  if (primaryValue === null || comparisonValue === null) {
    return <span className="text-xs text-muted-foreground">No change</span>
  }

  const diff = primaryValue - comparisonValue
  const percent =
    comparisonValue !== 0 ? ((diff / comparisonValue) * 100) : diff === 0 ? 0 : null

  if (diff === 0 || percent === 0) {
    return <span className="text-xs text-muted-foreground">No change</span>
  }

  const favorable = higherIsBetter ? diff > 0 : diff < 0
  const className = favorable ? 'text-xs font-medium text-green-600' : 'text-xs font-medium text-red-600'
  const directionArrow = diff > 0 ? '▲' : '▼'
  const percentLabel =
    percent !== null
      ? `${Math.abs(percent).toFixed(1)}%`
      : `${Math.abs(diff).toFixed(1)}`

  return (
    <span className={className}>
      {directionArrow} {percentLabel}
    </span>
  )
}

export function ComparisonView({
  primaryLabel = 'Current Filters',
  primaryData,
  comparisonData,
  comparisonLabel,
  comparisonTarget,
  onTargetChange,
  loading,
  error,
  onRetry,
  insights,
  canUseAllOtherDays
}: ComparisonViewProps) {
  const metricCards = useMemo(
    () =>
      metrics.map((metric) => {
        const primaryValue = primaryData ? primaryData[metric.key] : null
        const comparisonValue = comparisonData ? comparisonData[metric.key] : null

        return (
          <Card key={metric.key} className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{primaryLabel}</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {metric.format(primaryValue)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{comparisonLabel}</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {metric.format(comparisonValue)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs">Difference</span>
                <DeltaBadge
                  primary={primaryValue}
                  comparison={comparisonValue}
                  higherIsBetter={metric.higherIsBetter ?? true}
                />
              </div>
            </CardContent>
          </Card>
        )
      }),
    [primaryData, comparisonData, primaryLabel, comparisonLabel]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Comparison Mode</h2>
          <p className="text-sm text-muted-foreground">
            Analyze how the current filter set compares against another segment or time period.
          </p>
        </div>
        <ComparisonTargetSelector
          value={comparisonTarget}
          onChange={onTargetChange}
          className="w-full max-w-xs"
          disabled={loading}
          canUseAllOtherDays={canUseAllOtherDays}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border bg-card py-16 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Fetching comparison dataset...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-destructive shadow-sm">
          <p className="font-medium">Unable to load comparison data</p>
          <p className="mt-1 text-sm opacity-90">{error}</p>
          {onRetry ? (
            <Button onClick={onRetry} variant="outline" size="sm" className="mt-3 border-destructive text-destructive hover:bg-destructive/10">
              Try Again
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {metricCards}
          </div>

          {insights.length > 0 ? (
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {insights.map((insight) => (
                    <li
                      key={insight.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border px-3 py-2',
                        insight.sentiment === 'positive'
                          ? 'border-green-400 bg-green-50 text-green-900'
                          : insight.sentiment === 'negative'
                          ? 'border-red-400 bg-red-50 text-red-900'
                          : 'border-border bg-card text-foreground'
                      )}
                    >
                      <span className="text-xs font-bold uppercase text-muted-foreground">
                        {insight.metric}
                      </span>
                      <span className="leading-snug">{insight.message}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No standout differences detected yet. Adjust filters or pick another comparison target.
            </div>
          )}
        </>
      )}
    </div>
  )
}


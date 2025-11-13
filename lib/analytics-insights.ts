export type InsightSentiment = 'positive' | 'negative' | 'neutral'

export interface Insight {
  id: string
  metric: string
  message: string
  sentiment: InsightSentiment
  difference: number
  percentageDifference?: number
}

export interface AnalyticsSnapshot {
  showRate?: number | null
  closeRate?: number | null
  cancellationRate?: number | null
  noShowRate?: number | null
  qualifiedRate?: number | null
  cashCollected?: number | null
  scheduledCallsToDate?: number | null
  qualifiedCalls?: number | null
  totalUnitsClosed?: number | null
  dollarsOverScheduledCallsToDate?: number | null
  dollarsOverShow?: number | null
  averageSalesCycleDays?: number | null
  averageAppointmentLeadTimeDays?: number | null
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const round = (value: number, decimals = 1) =>
  Number.isFinite(value) ? parseFloat(value.toFixed(decimals)) : value

const createRateInsight = (
  metric: string,
  label: string,
  primary?: number | null,
  comparison?: number | null,
  threshold = 2
): Insight | null => {
  if (!isFiniteNumber(primary) || !isFiniteNumber(comparison)) {
    return null
  }

  const difference = round(primary - comparison)
  if (Math.abs(difference) < threshold) {
    return null
  }

  const sentiment: InsightSentiment =
    difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'neutral'
  const direction = difference > 0 ? 'higher' : 'lower'

  return {
    id: `${metric}-diff`,
    metric,
    sentiment,
    difference,
    percentageDifference: undefined,
    message: `${label} is ${Math.abs(difference).toFixed(1)} points ${direction} than comparison`
  }
}

const createValueInsight = (
  metric: string,
  label: string,
  primary?: number | null,
  comparison?: number | null,
  threshold = 5
): Insight | null => {
  if (!isFiniteNumber(primary) || !isFiniteNumber(comparison)) {
    return null
  }

  const difference = round(primary - comparison, 0)
  if (Math.abs(difference) < threshold) {
    return null
  }

  const sentiment: InsightSentiment =
    difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'neutral'
  const direction = difference > 0 ? 'higher' : 'lower'

  const percentageDifference =
    comparison !== 0 ? round((difference / comparison) * 100, 1) : null

  return {
    id: `${metric}-value-diff`,
    metric,
    sentiment,
    difference,
    percentageDifference: percentageDifference ?? undefined,
    message:
      percentageDifference !== null
        ? `${label} is ${Math.abs(percentageDifference).toFixed(1)}% ${direction} than comparison`
        : `${label} is ${Math.abs(difference).toLocaleString()} ${direction} than comparison`
  }
}

export function generateInsights(
  primary: AnalyticsSnapshot | null,
  comparison: AnalyticsSnapshot | null
): Insight[] {
  if (!primary || !comparison) {
    return []
  }

  const insights: Insight[] = []

  const rateInsights = [
    createRateInsight('showRate', 'Show rate', primary.showRate, comparison.showRate, 3),
    createRateInsight('qualifiedRate', 'Qualified rate', primary.qualifiedRate, comparison.qualifiedRate, 5),
    createRateInsight('closeRate', 'Close rate', primary.closeRate, comparison.closeRate, 3),
    createRateInsight(
      'cancellationRate',
      'Cancellation rate',
      comparison.cancellationRate,
      primary.cancellationRate,
      2
    ),
    createRateInsight(
      'noShowRate',
      'No-show rate',
      comparison.noShowRate,
      primary.noShowRate,
      2
    )
  ]

  rateInsights.forEach((insight) => {
    if (insight) {
      insights.push(insight)
    }
  })

  const valueInsights = [
    createValueInsight(
      'cashCollected',
      'Cash collected',
      primary.cashCollected,
      comparison.cashCollected,
      500
    ),
    createValueInsight(
      'scheduledCallsToDate',
      'Scheduled calls',
      primary.scheduledCallsToDate,
      comparison.scheduledCallsToDate,
      10
    ),
    createValueInsight(
      'totalUnitsClosed',
      'Units closed',
      primary.totalUnitsClosed,
      comparison.totalUnitsClosed,
      5
    )
  ]

  valueInsights.forEach((insight) => {
    if (insight) {
      insights.push(insight)
    }
  })

  return insights.slice(0, 5)
}


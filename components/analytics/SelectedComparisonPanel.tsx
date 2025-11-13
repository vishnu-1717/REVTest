'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface ComparisonMetric<T> {
  key: keyof T
  label: string
  format?: (value: any, row: T) => string
  higherIsBetter?: boolean
}

export interface SelectedComparisonPanelProps<T> {
  rows: T[]
  metrics: ComparisonMetric<T>[]
  title: string
  description?: string
  getName: (row: T) => string
}

const getNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const DiffBadge = ({
  current,
  baseline,
  higherIsBetter = true
}: {
  current: unknown
  baseline: unknown
  higherIsBetter?: boolean
}) => {
  const currentValue = getNumericValue(current)
  const baselineValue = getNumericValue(baseline)

  if (currentValue === null || baselineValue === null) {
    return <Badge variant="outline">—</Badge>
  }

  const diff = currentValue - baselineValue
  if (diff === 0) {
    return <Badge variant="outline">No change</Badge>
  }

  const favorable = higherIsBetter ? diff > 0 : diff < 0
  const colorClass = favorable ? 'text-green-600 border-green-500' : 'text-red-600 border-red-500'
  const label = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)

  return (
    <Badge variant="outline" className={cn('bg-white', colorClass)}>
      {label}
    </Badge>
  )
}

export function SelectedComparisonPanel<T>({
  rows,
  metrics,
  title,
  description,
  getName
}: SelectedComparisonPanelProps<T>) {
  if (!rows.length) {
    return null
  }

  const [baseline, ...others] = rows

  return (
    <Card className="border-border bg-card shadow-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Baseline</p>
            <h3 className="text-lg font-semibold">{getName(baseline)}</h3>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric) => {
              const baselineValue = baseline[metric.key]
              const formattedBaseline = metric.format
                ? metric.format(baselineValue, baseline)
                : (baselineValue as unknown as string) ?? '—'

              return (
                <Card key={String(metric.key)} className="border border-dashed border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {metric.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Baseline</p>
                      <p className="text-lg font-semibold text-foreground">{formattedBaseline}</p>
                    </div>

                    {others.map((row) => {
                      const value = row[metric.key]
                      const formattedValue = metric.format ? metric.format(value, row) : (value as unknown as string) ?? '—'

                      return (
                        <div key={getName(row)} className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">{getName(row)}</p>
                            <p className="text-sm font-semibold text-foreground">{formattedValue}</p>
                          </div>
                          <DiffBadge
                            baseline={baselineValue}
                            current={value}
                            higherIsBetter={metric.higherIsBetter}
                          />
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


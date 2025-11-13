'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { KeyboardEvent, ReactNode } from 'react'

type MetricStatus = 'neutral' | 'success' | 'warning' | 'danger'

const statusClasses: Record<MetricStatus, string> = {
  neutral:
    'border border-border bg-background hover:border-primary/60 dark:bg-neutral-900 dark:border-neutral-800',
  success:
    'border border-green-200 bg-green-50 text-green-700 hover:border-green-400 dark:border-green-900 dark:bg-green-950 dark:text-green-200',
  warning:
    'border border-yellow-200 bg-yellow-50 text-yellow-700 hover:border-yellow-400 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200',
  danger:
    'border border-red-200 bg-red-50 text-red-700 hover:border-red-400 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
}

interface ClickableMetricCardProps {
  title: string
  value: ReactNode
  description?: ReactNode
  status?: MetricStatus
  onClick?: () => void
  filterKey?: string
  filterValue?: string
  footer?: ReactNode
}

export function ClickableMetricCard({
  title,
  value,
  description,
  status = 'neutral',
  onClick,
  filterKey,
  filterValue,
  footer
}: ClickableMetricCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'h-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        onClick ? 'cursor-pointer hover:shadow-md' : '',
        statusClasses[status]
      )}
    >
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-bold">{value}</div>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
        {filterKey ? (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
            Click to add filter {filterValue ? `· ${filterValue}` : ''}
          </p>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  )
}


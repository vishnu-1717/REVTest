'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { KeyboardEvent, ReactNode } from 'react'

type MetricStatus = 'neutral' | 'success' | 'warning' | 'danger'

const statusClasses: Record<MetricStatus, string> = {
  neutral:
    'border border-border bg-card text-card-foreground shadow-sm hover:border-primary/50 dark:border-neutral-800 dark:bg-neutral-900',
  success:
    'border border-green-200 bg-green-100 text-green-900 shadow-sm hover:border-green-400 dark:border-green-900 dark:bg-green-950/70 dark:text-green-100',
  warning:
    'border border-yellow-200 bg-yellow-100 text-yellow-900 shadow-sm hover:border-yellow-400 dark:border-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-100',
  danger:
    'border border-red-200 bg-red-100 text-red-900 shadow-sm hover:border-red-400 dark:border-red-900 dark:bg-red-950/70 dark:text-red-100'
}

const valueClasses: Record<MetricStatus, string> = {
  neutral: 'text-foreground dark:text-white',
  success: 'text-green-800 dark:text-green-200',
  warning: 'text-yellow-900 dark:text-yellow-100',
  danger: 'text-red-800 dark:text-red-200'
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
  valueClassName?: string
}

export function ClickableMetricCard({
  title,
  value,
  description,
  status = 'neutral',
  onClick,
  filterKey,
  filterValue,
  footer,
  valueClassName
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
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div
          className={cn('text-3xl font-semibold', valueClasses[status], valueClassName)}
        >
          {value}
        </div>
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


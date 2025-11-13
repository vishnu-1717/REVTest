'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { KeyboardEvent, ReactNode } from 'react'

type MetricStatus = 'neutral' | 'success' | 'warning' | 'danger'

const statusClasses: Record<MetricStatus, string> = {
  neutral:
    'border border-border bg-card text-card-foreground shadow-sm hover:border-border/80',
  success:
    'border border-green-400 bg-green-50 text-green-900 shadow-sm hover:border-green-500',
  warning:
    'border border-amber-400 bg-amber-50 text-amber-900 shadow-sm hover:border-amber-500',
  danger:
    'border border-red-400 bg-red-50 text-red-900 shadow-sm hover:border-red-500'
}

const valueClasses: Record<MetricStatus, string> = {
  neutral: 'text-foreground',
  success: 'text-green-800',
  warning: 'text-amber-800',
  danger: 'text-red-800'
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
        'h-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        onClick ? 'cursor-pointer hover:shadow-lg' : '',
        statusClasses[status]
      )}
    >
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div className={cn('text-3xl font-semibold', valueClasses[status], valueClassName)}>
          {value}
        </div>
        {description ? <p>{description}</p> : null}
        {filterKey ? (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
            Click to add filter {filterValue ? `· ${filterValue}` : ''}
          </p>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  )}


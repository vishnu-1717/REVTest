'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { KeyboardEvent, ReactNode } from 'react'

type MetricStatus = 'neutral' | 'success' | 'warning' | 'danger'

const statusClasses: Record<MetricStatus, string> = {
  neutral:
    'border-border/60 bg-card hover:border-border',
  success:
    'border-emerald-500/30 bg-gradient-to-br from-emerald-50/80 to-card dark:from-emerald-950/30 dark:to-card hover:border-emerald-500/50',
  warning:
    'border-amber-500/30 bg-gradient-to-br from-amber-50/80 to-card dark:from-amber-950/30 dark:to-card hover:border-amber-500/50',
  danger:
    'border-red-500/30 bg-gradient-to-br from-red-50/80 to-card dark:from-red-950/30 dark:to-card hover:border-red-500/50'
}

const valueClasses: Record<MetricStatus, string> = {
  neutral: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400'
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
        'h-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.99]' : '',
        statusClasses[status]
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={cn('text-2xl font-bold tracking-tight', valueClasses[status], valueClassName)}>
          {value}
        </div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        {filterKey ? (
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 pt-1">
            Click to filter {filterValue ? `· ${filterValue}` : ''}
          </p>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  )
}



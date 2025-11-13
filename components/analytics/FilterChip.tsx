'use client'

import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface FilterChipProps {
  label: string
  onRemove: () => void
  color?: 'default' | 'success' | 'warning' | 'danger'
}

const colorClasses: Record<NonNullable<FilterChipProps['color']>, string> = {
  default:
    'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 dark:bg-primary/20 dark:text-primary-foreground',
  success:
    'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-100',
  warning:
    'bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-100',
  danger:
    'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-100'
}

export function FilterChip({ label, onRemove, color = 'default' }: FilterChipProps) {
  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-2 rounded-full pl-3 pr-2 text-sm transition-colors ${colorClasses[color]}`}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full bg-current/10 p-0.5 text-current transition hover:bg-current/20"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
}


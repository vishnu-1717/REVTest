'use client'

import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface FilterChipProps {
  label: string
  onRemove: () => void
  color?: 'default' | 'success' | 'warning' | 'danger'
}

const colorClasses: Record<NonNullable<FilterChipProps['color']>, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/80',
  success: 'bg-green-500 text-white hover:bg-green-600',
  warning: 'bg-yellow-500 text-black hover:bg-yellow-600',
  danger: 'bg-red-500 text-white hover:bg-red-600'
}

export function FilterChip({ label, onRemove, color = 'default' }: FilterChipProps) {
  return (
    <Badge
      variant="default"
      className={`flex items-center gap-1 rounded-full pl-3 pr-2 text-sm transition-colors ${colorClasses[color]}`}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full bg-white/20 p-0.5 transition hover:bg-white/30"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
}


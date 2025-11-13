'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { FilterChip as FilterChipComponent } from '@/components/analytics/FilterChip'

export interface FilterChip {
  key: string
  value: string
  label: string
}

interface FilterContextBarProps {
  filters: FilterChip[]
  onRemoveFilter: (key: string) => void
  onClearAll: () => void
  compareMode: boolean
  onToggleCompare: () => void
  appointmentCount: number
}

export function FilterContextBar({
  filters,
  onRemoveFilter,
  onClearAll,
  compareMode,
  onToggleCompare,
  appointmentCount
}: FilterContextBarProps) {
  return (
    <div className="mb-8 space-y-3 rounded-lg bg-muted/50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            🔍 Current Filter Context:
          </span>
          <div className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            Showing: {appointmentCount} appointments
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
            <Switch id="compare-mode" checked={compareMode} onCheckedChange={onToggleCompare} />
            <Label htmlFor="compare-mode" className="cursor-pointer text-sm">
              Compare Mode
            </Label>
          </div>

          {filters.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Clear All Filters
            </Button>
          )}
        </div>
      </div>

      {filters.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <FilterChipComponent
              key={filter.key}
              label={filter.label}
              onRemove={() => onRemoveFilter(filter.key)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No filters applied. Click any metric to start exploring.
        </p>
      )}
    </div>
  )
}


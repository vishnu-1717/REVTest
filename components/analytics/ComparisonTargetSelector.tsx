'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { type ComparisonTarget } from '@/lib/analytics-comparison'

interface ComparisonTargetSelectorProps {
  value: ComparisonTarget
  onChange: (value: ComparisonTarget) => void
  disabled?: boolean
  className?: string
  canUseAllOtherDays?: boolean
}

const TARGET_LABELS: Record<ComparisonTarget, string> = {
  overall: 'All Data (Same Range)',
  previous_period: 'Previous Period',
  all_other_days: 'All Other Days',
  weekdays: 'Weekdays',
  weekends: 'Weekends'
}

const options: ComparisonTarget[] = ['overall', 'previous_period', 'all_other_days', 'weekdays', 'weekends']

export function ComparisonTargetSelector({
  value,
  onChange,
  disabled,
  className,
  canUseAllOtherDays = false
}: ComparisonTargetSelectorProps) {
  const showAllOtherDaysHint = !disabled && !canUseAllOtherDays

  return (
    <div className={className}>
      <Label htmlFor="comparison-target" className="mb-1 block text-xs font-medium text-muted-foreground">
        Comparison Target
      </Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(nextValue) => onChange(nextValue as ComparisonTarget)}
      >
        <SelectTrigger id="comparison-target" className="w-full">
          <SelectValue placeholder="Select comparison" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option}
              value={option}
              disabled={disabled || (option === 'all_other_days' && !canUseAllOtherDays)}
            >
              {TARGET_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showAllOtherDaysHint ? (
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          Add a day-of-week filter to enable “All Other Days”.
        </p>
      ) : null}
    </div>
  )
}


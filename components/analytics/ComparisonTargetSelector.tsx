'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { type ComparisonTarget } from '@/lib/analytics-comparison'

interface ComparisonTargetSelectorProps {
  value: ComparisonTarget
  onChange: (value: ComparisonTarget) => void
  disabled?: boolean
  className?: string
}

export function ComparisonTargetSelector({
  value,
  onChange,
  disabled,
  className
}: ComparisonTargetSelectorProps) {
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
          <SelectItem value="overall">All Data (Same Range)</SelectItem>
          <SelectItem value="previous_period">Previous Period</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}


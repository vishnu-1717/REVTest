'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface DayOfWeekBarChartProps {
  data: Array<{
    dayOfWeek: number
    dayName: string
    total: number
    showed: number
    signed: number
  }>
  onBarClick?: (dayOfWeek: number) => void
}

export function DayOfWeekBarChart({ data, onBarClick }: DayOfWeekBarChartProps) {
  const chartData = data.map((row) => ({
    ...row,
    label: row.dayName ?? DAY_LABELS[row.dayOfWeek] ?? String(row.dayOfWeek)
  }))

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          Appointments by Day of Week
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            onClick={(payload: any) => {
              if (onBarClick && payload?.activePayload?.[0]) {
                const row = payload.activePayload[0].payload as (typeof chartData)[number]
                onBarClick(row.dayOfWeek)
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
            <XAxis dataKey="label" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip formatter={(value: number) => value.toLocaleString()} />
            <Bar dataKey="total" name="Scheduled" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="showed" name="Showed" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="signed" name="Signed" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}


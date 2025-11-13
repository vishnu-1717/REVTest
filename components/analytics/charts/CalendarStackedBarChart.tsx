'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CalendarStackedBarChartProps {
  data: Array<{
    calendar: string
    total: number
    showed: number
    signed: number
  }>
  onBarClick?: (calendar: string) => void
}

export function CalendarStackedBarChart({
  data,
  onBarClick
}: CalendarStackedBarChartProps) {
  const chartData = data.map((row) => ({
    ...row,
    noShows: Math.max(0, row.total - row.showed)
  }))

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          Calendar Performance (Stacked)
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            onClick={(payload: any) => {
              if (onBarClick && payload?.activePayload?.[0]) {
                const row = payload.activePayload[0].payload as (typeof chartData)[number]
                onBarClick(row.calendar)
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
            <XAxis type="number" stroke="#71717a" fontSize={12} />
            <YAxis
              dataKey="calendar"
              type="category"
              width={140}
              stroke="#71717a"
              fontSize={12}
            />
            <Tooltip formatter={(value: number) => value.toLocaleString()} />
            <Legend />
            <Bar dataKey="signed" stackId="a" name="Signed" fill="#22c55e" radius={[4, 4, 4, 4]} />
            <Bar dataKey="showed" stackId="a" name="Showed" fill="#6366f1" radius={[4, 4, 4, 4]} />
            <Bar dataKey="noShows" stackId="a" name="No Shows" fill="#ef4444" radius={[4, 4, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}


'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TimeSeriesLineChartProps {
  data: Array<{
    date: string
    scheduled: number
    showed: number
    signed: number
    cashCollected?: number
  }>
  onPointClick?: (date: string) => void
}

const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function TimeSeriesLineChart({ data, onPointClick }: TimeSeriesLineChartProps) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          Scheduled vs Showed vs Signed (Time Series)
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            onClick={(payload: any) => {
              if (onPointClick && payload?.activeLabel) {
                onPointClick(payload.activeLabel as string)
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              stroke="#71717a"
              fontSize={12}
            />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip
              labelFormatter={(value) => formatDateLabel(value as string)}
              formatter={(value: number, name) => [value.toLocaleString(), name]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="scheduled"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              name="Scheduled"
            />
            <Line
              type="monotone"
              dataKey="showed"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              name="Showed"
            />
            <Line
              type="monotone"
              dataKey="signed"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              name="Signed"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}


'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PendingPCN } from '@/types/pcn'
import { formatDistanceToNow } from 'date-fns'

export function PendingPCNsWidget() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<PendingPCN[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPending = async () => {
    try {
      const response = await fetch('/api/appointments/pending-pcns')
      const data = await response.json()
      setAppointments(data.appointments || [])
    } catch (error) {
      console.error('Failed to fetch pending PCNs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPending()
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchPending, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleClick = (appointmentId: string) => {
    router.push(`/pcn/${appointmentId}`)
  }

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-500'
      case 'medium':
        return 'bg-yellow-500'
      default:
        return 'bg-blue-500'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Post-Call Notes</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : appointments.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-green-600 font-semibold">All caught up! 🎉</p>
            <p className="text-gray-500 text-sm mt-1">No appointments need PCNs</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-600">
                {appointments.length} pending
              </span>
              {appointments.some(a => a.urgencyLevel === 'high') && (
                <Badge className="bg-red-500 text-white">Urgent!</Badge>
              )}
            </div>
            
            {appointments.slice(0, 5).map((apt) => (
              <div
                key={apt.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer border border-gray-200"
                onClick={() => handleClick(apt.id)}
              >
                <div className="flex-1">
                  <p className="font-medium text-sm">{apt.contactName}</p>
                  <p className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(apt.scheduledAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${getUrgencyColor(apt.urgencyLevel)}`} />
                  <span className="text-xs text-gray-500">{apt.minutesSinceScheduled}m ago</span>
                </div>
              </div>
            ))}
            
            {appointments.length > 5 && (
              <div className="text-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/appointments')}
                  className="text-xs"
                >
                  View All ({appointments.length})
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface PendingPCN {
  id: string
  contactName: string
  scheduledAt: string
  status: string
  urgencyLevel: string
  minutesSinceScheduled: number
  closerName?: string | null
}

export default function AppointmentsPage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<PendingPCN[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAppointments()
  }, [])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/appointments/pending-pcns', {
        credentials: 'include'
      })
      const data = await response.json()
      
      // For now, show pending PCNs (the endpoint only returns pending)
      // In the future, we can add an endpoint to fetch all appointments
      setAppointments(data.appointments || [])
    } catch (error) {
      console.error('Failed to fetch appointments:', error)
    } finally {
      setLoading(false)
    }
  }

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'signed':
        return <Badge className="bg-green-100 text-green-800">Signed</Badge>
      case 'showed':
        return <Badge className="bg-blue-100 text-blue-800">Showed</Badge>
      case 'no_show':
        return <Badge className="bg-red-100 text-red-800">No Show</Badge>
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Scheduled</Badge>
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-7xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Appointments</h1>
          <p className="text-gray-500">Manage and view all appointments</p>
        </div>
      </div>

      {/* Appointments List */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Post-Call Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-green-600 font-semibold">All caught up! 🎉</p>
              <p className="text-gray-500 text-sm mt-1">No appointments need PCNs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer border border-gray-200"
                  onClick={() => handleClick(apt.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-medium">{apt.contactName}</p>
                      {getStatusBadge(apt.status)}
                    </div>
                    {apt.closerName && (
                      <p className="text-sm text-gray-600">
                        Closer: {apt.closerName}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Scheduled {formatDistanceToNow(new Date(apt.scheduledAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${getUrgencyColor(apt.urgencyLevel)}`} />
                      <span className="text-xs text-gray-500">
                        {apt.minutesSinceScheduled}m ago
                      </span>
                    </div>
                    <Button size="sm" variant="outline">
                      Submit PCN
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PCNForm } from '@/components/PCNForm'
import { PCNAppointmentData } from '@/types/pcn'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function PCNSubmissionPage() {
  const params = useParams()
  const router = useRouter()
  const appointmentId = params.appointmentId as string
  
  const [appointment, setAppointment] = useState<PCNAppointmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAppointment() {
      try {
        const response = await fetch(`/api/appointments/${appointmentId}`)
        
        if (!response.ok) {
          throw new Error('Appointment not found')
        }
        
        const data = await response.json()
        setAppointment(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load appointment')
      } finally {
        setLoading(false)
      }
    }

    if (appointmentId) {
      fetchAppointment()
    }
  }, [appointmentId])

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-gray-500">Loading appointment...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !appointment) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardContent className="p-10 text-center">
            <h2 className="text-xl font-semibold mb-2">Appointment Not Found</h2>
            <p className="text-gray-500 mb-4">{error || 'The appointment you are looking for does not exist.'}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Return to Dashboard
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Post-Call Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <PCNForm appointment={appointment} />
        </CardContent>
      </Card>
    </div>
  )
}


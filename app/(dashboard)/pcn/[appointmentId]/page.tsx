'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PCNForm } from '@/components/PCNForm'
import { PCNAppointmentData } from '@/types/pcn'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function PCNSubmissionPage() {
  const params = useParams()
  const router = useRouter()
  const appointmentId = params.appointmentId as string
  
  const [appointment, setAppointment] = useState<PCNAppointmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [appointmentRes, userRes] = await Promise.all([
          fetch(`/api/appointments/${appointmentId}`),
          fetch('/api/admin/users/me', { credentials: 'include' })
        ])

        if (!appointmentRes.ok) {
          throw new Error('Appointment not found')
        }

        const appointmentData = await appointmentRes.json()
        setAppointment(appointmentData)

        if (userRes.ok) {
          const userData = await userRes.json()
          if (userData?.role === 'admin' || userData?.superAdmin) {
            setIsAdmin(true)
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load appointment')
      } finally {
        setLoading(false)
      }
    }

    if (appointmentId) {
      fetchData()
    }
  }, [appointmentId])

  const handleDelete = async () => {
    if (!appointment) return

    const confirmDelete = window.confirm(
      'Are you sure you want to delete this appointment and its PCN? This action cannot be undone.'
    )

    if (!confirmDelete) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      const response = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete appointment')
      }

      window.alert('Appointment deleted successfully.')
      router.push('/appointments')
      router.refresh()
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete appointment')
    } finally {
      setIsDeleting(false)
    }
  }

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
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Post-Call Notes</CardTitle>
          {isAdmin && (
            <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
              {deleteError && (
                <span className="text-sm text-red-600">{deleteError}</span>
              )}
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Appointment'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <PCNForm appointment={appointment} />
        </CardContent>
      </Card>
    </div>
  )
}


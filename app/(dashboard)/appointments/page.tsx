'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDistanceToNow } from 'date-fns'
import { formatMinutesOverdue } from '@/lib/utils'

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
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc')

  useEffect(() => {
    fetchAppointments()
  }, [])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      // Fetch all pending PCNs when on the appointments page
      const response = await fetch('/api/appointments/pending-pcns?all=true', {
        credentials: 'include'
      })
      const data = await response.json()
      
      setAppointments(data.appointments || [])
      setTotalCount(data.totalCount || 0)
    } catch (error) {
      console.error('Failed to fetch appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter and sort appointments based on search query and date sort order
  const filteredAppointments = useMemo(() => {
    let results = appointments

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      results = results.filter(apt => {
        const contactMatch = apt.contactName?.toLowerCase().includes(query)
        const closerMatch = apt.closerName?.toLowerCase().includes(query)
        return contactMatch || closerMatch
      })
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      results = results.filter(apt => new Date(apt.scheduledAt) >= fromDate)
    }

    if (dateTo) {
      const toDate = new Date(dateTo)
      toDate.setHours(23, 59, 59, 999)
      results = results.filter(apt => new Date(apt.scheduledAt) <= toDate)
    }

    return [...results].sort((a, b) => {
      const dateA = new Date(a.scheduledAt).getTime()
      const dateB = new Date(b.scheduledAt).getTime()

      if (dateSort === 'asc') {
        return dateA - dateB
      }

      return dateB - dateA
    })
  }, [appointments, searchQuery, dateFrom, dateTo, dateSort])

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
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Pending Post-Call Notes</CardTitle>
              {totalCount > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {totalCount} total pending {searchQuery && `(${filteredAppointments.length} matching)`}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search & Filters */}
          <div className="mb-6 space-y-3 md:space-y-0 md:grid md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end md:gap-4">
            <Input
              type="text"
              placeholder="Search by contact name or closer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />

            <div
              className="cursor-pointer"
              onClick={(e) => {
                const input = (e.currentTarget as HTMLElement).querySelector('input[type="date"]') as HTMLInputElement
                if (input) {
                  if (typeof input.showPicker === 'function') {
                    input.showPicker()
                  } else {
                    input.focus()
                  }
                }
              }}
            >
              <label className="text-sm font-medium mb-2 block cursor-pointer" htmlFor="dateFrom">
                From date
              </label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  const input = e.currentTarget as HTMLInputElement
                  if (typeof input.showPicker === 'function') {
                    input.showPicker()
                  } else {
                    input.focus()
                  }
                }}
              />
            </div>

            <div
              className="cursor-pointer"
              onClick={(e) => {
                const input = (e.currentTarget as HTMLElement).querySelector('input[type="date"]') as HTMLInputElement
                if (input) {
                  if (typeof input.showPicker === 'function') {
                    input.showPicker()
                  } else {
                    input.focus()
                  }
                }
              }}
            >
              <label className="text-sm font-medium mb-2 block cursor-pointer" htmlFor="dateTo">
                To date
              </label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  const input = e.currentTarget as HTMLInputElement
                  if (typeof input.showPicker === 'function') {
                    input.showPicker()
                  } else {
                    input.focus()
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2 md:justify-end">
              <span className="text-sm text-gray-600">Sort by date:</span>
              <Select value={dateSort} onValueChange={(value: 'asc' | 'desc') => setDateSort(value)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Newest first" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest first</SelectItem>
                  <SelectItem value="asc">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-center py-8">
              {searchQuery ? (
                <>
                  <p className="text-gray-600 font-semibold">No matches found</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Try a different search term
                  </p>
                </>
              ) : (
                <>
                  <p className="text-green-600 font-semibold">All caught up! 🎉</p>
                  <p className="text-gray-500 text-sm mt-1">No appointments need PCNs</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAppointments.map((apt) => (
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
                        {formatMinutesOverdue(apt.minutesSinceScheduled)} ago
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


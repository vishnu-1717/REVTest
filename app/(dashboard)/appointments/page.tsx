'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import {
  PendingPCN,
  PendingPCNCloserSummary,
  PendingPCNsResponse,
  UpcomingAppointment,
  UpcomingAppointmentsResponse
} from '@/types/pcn'

export default function AppointmentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [appointments, setAppointments] = useState<PendingPCN[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc')
  const [timezone, setTimezone] = useState('UTC')
  const [isAdmin, setIsAdmin] = useState(false)
  const [closers, setClosers] = useState<PendingPCNCloserSummary[]>([])
  const [closerFilter, setCloserFilter] = useState<string>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([])
  const [upcomingTotal, setUpcomingTotal] = useState<number>(0)
  const [upcomingLoading, setUpcomingLoading] = useState<boolean>(false)
  const [upcomingCloserOptions, setUpcomingCloserOptions] = useState<Array<{ id: string; name: string }>>([])
  const [upcomingCalendarOptions, setUpcomingCalendarOptions] = useState<Array<{ key: string; label: string }>>([])
  const [upcomingCloserFilter, setUpcomingCloserFilter] = useState<string>('all')
  const [upcomingCalendarFilter, setUpcomingCalendarFilter] = useState<string>('all')
  const [upcomingDateFrom, setUpcomingDateFrom] = useState<string>('')
  const [upcomingDateTo, setUpcomingDateTo] = useState<string>('')

  const appendViewAs = useCallback((url: string) => {
    if (typeof window === 'undefined') return url
    const params = new URLSearchParams(window.location.search)
    const viewAs = params.get('viewAs')
    if (!viewAs) return url
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}viewAs=${viewAs}`
  }, [])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      // Fetch all pending PCNs when on the appointments page
      const response = await fetch(appendViewAs('/api/appointments/pending-pcns?all=true&groupBy=closer'), {
        credentials: 'include'
      })
      const data: PendingPCNsResponse = await response.json()
      
      setAppointments(data.appointments || [])
      setTotalCount(data.totalCount || 0)
      if (data.timezone) {
        setTimezone(data.timezone)
      }
      if (data.byCloser) {
        setClosers(data.byCloser)
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUpcomingAppointments = useCallback(async () => {
    try {
      setUpcomingLoading(true)
      const params = new URLSearchParams()
      if (upcomingDateFrom) {
        params.append('dateFrom', upcomingDateFrom)
      }
      if (upcomingDateTo) {
        params.append('dateTo', upcomingDateTo)
      }
      if (upcomingCloserFilter !== 'all') {
        params.append('closerId', upcomingCloserFilter)
      }
      if (upcomingCalendarFilter !== 'all') {
        params.append('calendar', upcomingCalendarFilter)
      }
      params.append('limit', '500')

      const response = await fetch(
        appendViewAs(`/api/appointments/upcoming?${params.toString()}`),
        { credentials: 'include' }
      )
      const data: UpcomingAppointmentsResponse = await response.json()

      setUpcomingAppointments(data.appointments || [])
      setUpcomingTotal(data.totalCount || 0)
      if (data.timezone) {
        setTimezone(data.timezone)
      }
      if (data.closers) {
        setUpcomingCloserOptions(data.closers)
      }
      if (data.calendars) {
        setUpcomingCalendarOptions(data.calendars)
      }
    } catch (error) {
      console.error('Failed to fetch upcoming appointments:', error)
    } finally {
      setUpcomingLoading(false)
    }
  }, [
    appendViewAs,
    upcomingCalendarFilter,
    upcomingCloserFilter,
    upcomingDateFrom,
    upcomingDateTo
  ])

  useEffect(() => {
    fetchUser()
    fetchAppointments()
  }, [])

  useEffect(() => {
    fetchUpcomingAppointments()
  }, [fetchUpcomingAppointments])

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/admin/users/me', {
        credentials: 'include'
      })

      if (!response.ok) {
        return
      }

      const user = await response.json()
      if (user?.role === 'admin' || user?.superAdmin) {
        setIsAdmin(true)
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
    }
  }
  const handleDelete = async (appointmentId: string) => {
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this appointment and its PCN? This action cannot be undone.'
    )

    if (!confirmDelete) return

    setDeletingId(appointmentId)
    setDeleteError(null)

    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete appointment')
      }

      setAppointments(prev => prev.filter(apt => apt.id !== appointmentId))
      setTotalCount(prev => Math.max(prev - 1, 0))
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete appointment')
    } finally {
      setDeletingId(null)
    }
  }

  // Filter and sort appointments based on search query and date sort order
  const filteredAppointments = useMemo(() => {
    let results = appointments

    if (closerFilter !== 'all') {
      if (closerFilter === 'unassigned') {
        results = results.filter((apt) => !apt.closerId)
      } else {
        results = results.filter((apt) => apt.closerId === closerFilter)
      }
    }

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

  const scheduledFormatter = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }, [timezone])

  const formatScheduledAt = useCallback((iso: string) => {
    try {
      return scheduledFormatter.format(new Date(iso))
    } catch {
      return new Date(iso).toLocaleString()
    }
  }, [scheduledFormatter])

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

  const upcomingCloserSelectOptions = useMemo(() => {
    const baseOptions = [
      { value: 'all', label: 'All closers' },
      { value: 'unassigned', label: 'Unassigned' }
    ]
    const additional = upcomingCloserOptions
      .filter((closer) => closer.id)
      .map((closer) => ({
        value: closer.id,
        label: closer.name || 'Unnamed rep'
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return [...baseOptions, ...additional]
  }, [upcomingCloserOptions])

  const upcomingCalendarSelectOptions = useMemo(() => {
    const baseOptions = [{ value: 'all', label: 'All calendars' }]
    const additional = upcomingCalendarOptions
      .map((calendar) => ({
        value: calendar.key,
        label: calendar.label
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return [...baseOptions, ...additional]
  }, [upcomingCalendarOptions])

  const closerFromQuery = searchParams?.get('closerId')

  useEffect(() => {
    if (!closerFromQuery) {
      setCloserFilter('all')
      return
    }
    setCloserFilter(closerFromQuery)
  }, [closerFromQuery])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const current = new URLSearchParams(window.location.search)
    const existingValue = current.get('closerId') ?? 'all'

    if (closerFilter === 'all') {
      if (existingValue !== 'all') {
        current.delete('closerId')
        const search = current.toString()
        router.replace(`/appointments${search ? `?${search}` : ''}`, { scroll: false })
      }
    } else if (existingValue !== closerFilter) {
      current.set('closerId', closerFilter)
      router.replace(`/appointments?${current.toString()}`, { scroll: false })
    }
  }, [closerFilter, router])

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
              <p className="text-sm text-gray-500 mt-1">
                Reporting in {timezone}
              </p>
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
          <div className="mb-6 space-y-3 md:space-y-0 md:grid md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end md:gap-4">
            <Input
              type="text"
              placeholder="Search by contact name or closer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />

            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2">Closer</label>
              <Select value={closerFilter} onValueChange={(value) => setCloserFilter(value)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All closers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All closers</SelectItem>
                  {closers.map((closer) => (
                    <SelectItem
                      key={closer.closerId ?? 'unassigned'}
                      value={closer.closerId ?? 'unassigned'}
                    >
                      {closer.closerName} ({closer.pendingCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {deleteError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}

          <p className="mb-4 text-xs text-gray-500">
            Displaying times in <span className="font-medium">{timezone}</span>
          </p>

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
                      Scheduled {formatScheduledAt(apt.scheduledAt)} ({formatDistanceToNow(new Date(apt.scheduledAt), { addSuffix: true })})
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${getUrgencyColor(apt.urgencyLevel)}`} />
                      <span className="text-xs text-gray-500">
                        {formatMinutesOverdue(apt.minutesSinceScheduled)} ago
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline">
                        Submit PCN
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(apt.id)
                          }}
                          disabled={deletingId === apt.id}
                        >
                          {deletingId === apt.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Upcoming Appointments</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Appointments scheduled in the future. PCNs become available 10 minutes after the start time.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Times shown in {timezone}
              </p>
            </div>
            <Badge variant="outline">
              {upcomingTotal} upcoming
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium mb-2">From date</label>
              <Input
                type="date"
                value={upcomingDateFrom}
                onChange={(e) => setUpcomingDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">To date</label>
              <Input
                type="date"
                value={upcomingDateTo}
                onChange={(e) => setUpcomingDateTo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Closer</label>
              <Select
                value={upcomingCloserFilter}
                onValueChange={setUpcomingCloserFilter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All closers" />
                </SelectTrigger>
                <SelectContent>
                  {upcomingCloserSelectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Calendar</label>
              <Select
                value={upcomingCalendarFilter}
                onValueChange={setUpcomingCalendarFilter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All calendars" />
                </SelectTrigger>
                <SelectContent>
                  {upcomingCalendarSelectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setUpcomingDateFrom('')
                setUpcomingDateTo('')
                setUpcomingCloserFilter('all')
                setUpcomingCalendarFilter('all')
              }}
            >
              Reset filters
            </Button>
          </div>

          <div className="rounded-lg border">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-sm font-medium text-gray-500 border-b bg-gray-50">
              <div className="col-span-4 md:col-span-3">Scheduled</div>
              <div className="col-span-4 md:col-span-3">Contact</div>
              <div className="hidden md:block md:col-span-3">Closer</div>
              <div className="col-span-4 md:col-span-3">Calendar</div>
            </div>
            {upcomingLoading ? (
              <div className="py-6 text-center text-gray-500 text-sm">
                Loading upcoming appointments...
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <div className="py-6 text-center text-gray-500 text-sm">
                No upcoming appointments for the selected filters.
              </div>
            ) : (
              upcomingAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 text-sm border-b last:border-b-0 hover:bg-gray-50 transition"
                >
                  <div className="col-span-4 md:col-span-3 font-medium">
                    {formatScheduledAt(apt.scheduledAt)}
                  </div>
                  <div className="col-span-4 md:col-span-3">
                    <div className="font-medium">{apt.contactName}</div>
                    <div className="md:hidden text-xs text-gray-500 mt-1">
                      Closer: {apt.closerName || 'Unassigned'}
                    </div>
                  </div>
                  <div className="hidden md:block md:col-span-3 text-gray-600">
                    {apt.closerName || 'Unassigned'}
                  </div>
                  <div className="col-span-4 md:col-span-3 text-gray-600">
                    {apt.calendarName || 'Unassigned'}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


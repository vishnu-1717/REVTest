'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Check, RefreshCw } from 'lucide-react'

interface Calendar {
  id: string
  name: string
  description: string | null
  isActive: boolean
  trafficSource: string | null
  calendarType: string | null
  isCloserCalendar: boolean
  defaultCloserId: string | null
  defaultCloser: {
    id: string
    name: string
    email: string
  } | null
  _count: {
    appointments: number
  }
}

interface User {
  id: string
  name: string
  email: string
  isActive: boolean
  role: string
}

const getViewAsCompany = () => {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const viewAsParam = params.get('viewAs')
  if (viewAsParam) return viewAsParam
  const match = document.cookie.match(/(?:^|;)\s*view_as_company=([^;]+)/)
  const value = match ? decodeURIComponent(match[1]) : null
  if (value === 'none') return null
  return value
}

const withViewAs = (url: string) => {
  const viewAs = getViewAsCompany()
  if (!viewAs) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}viewAs=${viewAs}`
}

export default function CalendarsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'approved' | 'unapproved'>('all')

  useEffect(() => {
    fetchCalendars()
    fetchUsers()
  }, [])

  const fetchCalendars = async () => {
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/ghl/calendars'))
      if (!res.ok) throw new Error('Failed to fetch calendars')
      const data = await res.json()
      setCalendars(data)
    } catch (error) {
      console.error('Failed to fetch calendars:', error)
      alert('Failed to load calendars')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch(withViewAs('/api/admin/users'))
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      // Filter to active closers/reps
      const activeClosers = data.filter((u: User) =>
        u.isActive && (u.role === 'closer' || u.role === 'rep' || u.role === 'admin')
      )
      setUsers(activeClosers)
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const handleSyncCalendars = async () => {
    setSyncing(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/ghl/calendars'), {
        method: 'POST'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to sync calendars')
      }

      const data = await res.json()
      await fetchCalendars()
      alert(`Synced ${data.count} calendars successfully!`)
    } catch (error: any) {
      console.error('Failed to sync calendars:', error)
      alert(`Failed to sync calendars: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleUpdateCalendar = async (calendarId: string, updates: Partial<Calendar>) => {
    try {
      const res = await fetch(withViewAs(`/api/admin/integrations/ghl/calendars/${calendarId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      // Read response body once
      let data: any
      try {
        const text = await res.text()
        if (!text) {
          throw new Error('Empty response from server')
        }
        try {
          data = JSON.parse(text)
        } catch (parseError) {
          // Response is not valid JSON - this shouldn't happen but handle it
          throw new Error(`Invalid response from server: ${text.substring(0, 100)}`)
        }
      } catch (error: any) {
        // If we can't read the response at all
        throw new Error(error.message || 'Failed to update calendar: Could not read server response')
      }

      if (!res.ok) {
        // API returned an error response
        throw new Error(data.error || 'Failed to update calendar')
      }

      // Update local state
      setCalendars(prev => prev.map(cal =>
        cal.id === calendarId ? { ...cal, ...updates } : cal
      ))
    } catch (error: any) {
      console.error('Failed to update calendar:', error)
      alert(`Failed to update calendar: ${error.message}`)
      throw error
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      // Save all calendars that have been modified
      // For now, we'll save all - in a real implementation, you'd track which ones changed
      await Promise.all(
        calendars.map(cal => {
          const updates: any = {
            trafficSource: cal.trafficSource || null,
            calendarType: cal.calendarType || null,
            isCloserCalendar: cal.isCloserCalendar,
            defaultCloserId: cal.defaultCloserId === 'unassigned' ? null : (cal.defaultCloserId || null)
          }
          return handleUpdateCalendar(cal.id, updates)
        })
      )

      alert('All calendars saved successfully!')
    } catch (error) {
      // Error already shown in handleUpdateCalendar
    } finally {
      setSaving(false)
    }
  }

  const filteredCalendars = calendars.filter(cal => {
    if (filter === 'approved') return cal.isCloserCalendar
    if (filter === 'unapproved') return !cal.isCloserCalendar
    return true
  })

  const approvedCount = calendars.filter(cal => cal.isCloserCalendar).length
  const unapprovedCount = calendars.filter(cal => !cal.isCloserCalendar).length

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <div className="text-center">Loading calendars...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Calendar Management</h1>
            <p className="text-gray-600">
              Manage which calendars create appointments and assign default closers
            </p>
          </div>
          <Button
            onClick={handleSyncCalendars}
            disabled={syncing}
            variant="outline"
          >
            {syncing ? 'Syncing...' : <><RefreshCw className="mr-2 h-4 w-4" /> Sync from GHL</>}
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            size="sm"
          >
            All ({calendars.length})
          </Button>
          <Button
            variant={filter === 'approved' ? 'default' : 'outline'}
            onClick={() => setFilter('approved')}
            size="sm"
          >
            Approved ({approvedCount})
          </Button>
          <Button
            variant={filter === 'unapproved' ? 'default' : 'outline'}
            onClick={() => setFilter('unapproved')}
            size="sm"
          >
            Not Approved ({unapprovedCount})
          </Button>
        </div>
      </div>

      {filteredCalendars.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            {filter === 'all'
              ? 'No calendars found. Sync calendars from GHL to get started.'
              : filter === 'approved'
                ? 'No approved calendars. Approve calendars to allow them to create appointments.'
                : 'All calendars are approved.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 mb-8">
          {filteredCalendars.map((cal) => (
            <Card key={cal.id} className={cal.isCloserCalendar ? 'border-green-200 bg-green-50/30' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-lg">{cal.name}</CardTitle>
                      {cal.isCloserCalendar && (
                        <Badge variant="default" className="bg-green-600 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Approved
                        </Badge>
                      )}
                      {!cal.isCloserCalendar && (
                        <Badge variant="outline" className="border-gray-300">
                          Not Approved
                        </Badge>
                      )}
                      {!cal.isActive && (
                        <Badge variant="outline" className="border-orange-300 text-orange-700">
                          Inactive in GHL
                        </Badge>
                      )}
                    </div>
                    {cal.description && (
                      <p className="text-sm text-gray-600 mt-1">{cal.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {cal._count.appointments} appointment{cal._count.appointments !== 1 ? 's' : ''} created
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Approval Toggle */}
                <div className="flex items-center gap-4">
                  <Label htmlFor={`approve-${cal.id}`} className="font-medium min-w-[140px]">
                    Approve for Closers
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`approve-${cal.id}`}
                      checked={cal.isCloserCalendar}
                      onChange={(e) => {
                        const updated = [...calendars]
                        const index = updated.findIndex(c => c.id === cal.id)
                        if (index >= 0) {
                          updated[index].isCloserCalendar = e.target.checked
                          setCalendars(updated)
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">
                      {cal.isCloserCalendar
                        ? 'Appointments from this calendar will be created'
                        : 'Appointments from this calendar will be rejected'}
                    </span>
                  </div>
                </div>

                {/* Default Closer */}
                <div className="flex items-center gap-4">
                  <Label htmlFor={`closer-${cal.id}`} className="font-medium min-w-[140px]">
                    Default Closer
                  </Label>
                  <Select
                    value={cal.defaultCloserId || 'unassigned'}
                    onValueChange={(value) => {
                      const updated = [...calendars]
                      const index = updated.findIndex(c => c.id === cal.id)
                      if (index >= 0) {
                        if (value === 'unassigned') {
                          updated[index].defaultCloserId = null
                          updated[index].defaultCloser = null
                        } else {
                          updated[index].defaultCloserId = value
                          const selectedUser = users.find(u => u.id === value)
                          updated[index].defaultCloser = selectedUser ? {
                            id: selectedUser.id,
                            name: selectedUser.name,
                            email: selectedUser.email
                          } : null
                        }
                        setCalendars(updated)
                      }
                    }}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Unassigned (no default closer)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned (no default closer)</SelectItem>
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-gray-500">
                    Note: Default closer is not automatically assigned. Appointments remain unassigned if no closer is matched.
                  </span>
                </div>

                {/* Traffic Source */}
                <div className="flex items-center gap-4">
                  <Label htmlFor={`traffic-${cal.id}`} className="font-medium min-w-[140px]">
                    Traffic Source
                  </Label>
                  <Input
                    id={`traffic-${cal.id}`}
                    placeholder="e.g. Meta, Google, Organic Instagram"
                    value={cal.trafficSource || ''}
                    onChange={(e) => {
                      const updated = [...calendars]
                      const index = updated.findIndex(c => c.id === cal.id)
                      if (index >= 0) {
                        updated[index].trafficSource = e.target.value || null
                        setCalendars(updated)
                      }
                    }}
                    className="w-64"
                  />
                </div>

                {/* Calendar Type */}
                <div className="flex items-center gap-4">
                  <Label htmlFor={`type-${cal.id}`} className="font-medium min-w-[140px]">
                    Calendar Type
                  </Label>
                  <Input
                    id={`type-${cal.id}`}
                    placeholder="e.g. closer, setter, follow-up"
                    value={cal.calendarType || ''}
                    onChange={(e) => {
                      const updated = [...calendars]
                      const index = updated.findIndex(c => c.id === cal.id)
                      if (index >= 0) {
                        updated[index].calendarType = e.target.value || null
                        setCalendars(updated)
                      }
                    }}
                    className="w-64"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSaveAll} disabled={saving} className="flex-1">
          {saving ? 'Saving...' : 'Save All Changes'}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard')}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  )
}


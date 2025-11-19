'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

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

interface Closer {
  id: string
  name: string
  email: string
  slackUserId: string | null
  slackUserName: string | null
}

interface SlackUser {
  id: string
  name: string
  real_name: string
  email?: string
}

export default function SlackSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [closers, setClosers] = useState<Closer[]>([])
  const [slackUsers, setSlackUsers] = useState<SlackUser[]>([])
  const [loadingSlackUsers, setLoadingSlackUsers] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetchClosers()
    fetchSlackUsers()
  }, [])

  const fetchClosers = async () => {
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/slack/closers'))
      const data = await res.json()
      if (res.ok) {
        setClosers(data.closers || [])
      }
    } catch (error) {
      console.error('Error fetching closers:', error)
    }
  }

  const fetchSlackUsers = async () => {
    setLoadingSlackUsers(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/slack/users'))
      const data = await res.json()
      if (res.ok) {
        setSlackUsers(data.users || [])
      } else {
        alert(data.error || 'Failed to fetch Slack users')
      }
    } catch (error) {
      console.error('Error fetching Slack users:', error)
      alert('Failed to fetch Slack users')
    } finally {
      setLoadingSlackUsers(false)
    }
  }

  const handleUpdateMapping = async (closerId: string, slackUserId: string | null, slackUserName: string | null) => {
    setUpdating(closerId)
    try {
      const res = await fetch(withViewAs(`/api/admin/integrations/slack/users/${closerId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slackUserId,
          slackUserName,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update mapping')
      }

      // Update local state
      setClosers((prev) =>
        prev.map((c) =>
          c.id === closerId
            ? { ...c, slackUserId, slackUserName }
            : c
        )
      )
    } catch (error: any) {
      console.error('Error updating mapping:', error)
      alert(error.message || 'Failed to update mapping')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Slack User Mappings</CardTitle>
          <CardDescription>
            Map your closers to their Slack users so they can be tagged in PCN notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Closers without Slack mappings will not receive PCN notifications
            </p>
            <Button onClick={fetchSlackUsers} disabled={loadingSlackUsers} variant="outline">
              {loadingSlackUsers ? 'Loading...' : 'Refresh Slack Users'}
            </Button>
          </div>

          {closers.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No active closers found</p>
          ) : (
            <div className="space-y-4">
              {closers.map((closer) => (
                <div
                  key={closer.id}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">{closer.name}</p>
                    <p className="text-sm text-gray-500">{closer.email}</p>
                    {closer.slackUserId && (
                      <p className="text-xs text-green-600 mt-1">
                        Mapped to: {closer.slackUserName || closer.slackUserId}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={closer.slackUserId || 'none'}
                      onValueChange={(value) => {
                        if (value === 'none') {
                          handleUpdateMapping(closer.id, null, null)
                        } else {
                          const slackUser = slackUsers.find((u) => u.id === value)
                          if (slackUser) {
                            handleUpdateMapping(closer.id, slackUser.id, slackUser.real_name || slackUser.name)
                          }
                        }
                      }}
                      disabled={updating === closer.id || loadingSlackUsers}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select Slack user" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No mapping</SelectItem>
                        {slackUsers.map((slackUser) => (
                          <SelectItem key={slackUser.id} value={slackUser.id}>
                            {slackUser.real_name || slackUser.name}
                            {slackUser.email && ` (${slackUser.email})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {updating === closer.id && (
                      <span className="text-sm text-gray-500">Updating...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t">
            <Button onClick={() => router.push('/admin/integrations')} variant="outline">
              Back to Integrations
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


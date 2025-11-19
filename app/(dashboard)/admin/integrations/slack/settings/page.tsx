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

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  is_archived: boolean
}

export default function SlackSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [closers, setClosers] = useState<Closer[]>([])
  const [slackUsers, setSlackUsers] = useState<SlackUser[]>([])
  const [loadingSlackUsers, setLoadingSlackUsers] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  
  // Channel selection state
  const [channels, setChannels] = useState<SlackChannel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [updatingChannel, setUpdatingChannel] = useState(false)

  useEffect(() => {
    fetchClosers()
    fetchSlackUsers()
    fetchChannels()
    fetchCurrentChannel()
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

  const fetchChannels = async () => {
    setLoadingChannels(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/slack/channels'))
      const data = await res.json()
      if (res.ok) {
        setChannels(data.channels || [])
      } else {
        alert(data.error || 'Failed to fetch channels')
      }
    } catch (error) {
      console.error('Error fetching channels:', error)
      alert('Failed to fetch channels')
    } finally {
      setLoadingChannels(false)
    }
  }

  const fetchCurrentChannel = async () => {
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/slack/channel'))
      const data = await res.json()
      if (res.ok) {
        setSelectedChannelId(data.channelId || null)
      }
    } catch (error) {
      console.error('Error fetching current channel:', error)
    }
  }

  const handleUpdateChannel = async (channelId: string | null) => {
    setUpdatingChannel(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/slack/channel'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update channel')
      }

      setSelectedChannelId(channelId)
      alert('Default channel updated successfully')
    } catch (error: any) {
      console.error('Error updating channel:', error)
      alert(error.message || 'Failed to update channel')
    } finally {
      setUpdatingChannel(false)
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
    <div className="container mx-auto py-10 max-w-4xl space-y-6">
      {/* Default Channel Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Default Channel</CardTitle>
          <CardDescription>
            Choose which Slack channel receives PCN notifications. If no channel is selected, notifications will be sent via DM to each closer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select
                value={selectedChannelId || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    handleUpdateChannel(null)
                  } else {
                    handleUpdateChannel(value)
                  }
                }}
                disabled={updatingChannel || loadingChannels}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No channel (use DMs)</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      #{channel.name}
                      {channel.is_private && ' (private)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedChannelId && (
                <p className="text-sm text-gray-500 mt-2">
                  Current: #{channels.find((c) => c.id === selectedChannelId)?.name || 'Unknown'}
                </p>
              )}
              {!selectedChannelId && (
                <p className="text-sm text-gray-500 mt-2">
                  No default channel set. Notifications will be sent via DM to closers.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={fetchChannels}
                disabled={loadingChannels}
                variant="outline"
              >
                {loadingChannels ? 'Loading...' : 'Refresh Channels'}
              </Button>
              {updatingChannel && (
                <span className="text-sm text-gray-500 flex items-center">Updating...</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Mappings */}
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


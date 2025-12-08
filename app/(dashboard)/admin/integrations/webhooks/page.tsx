'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface WebhookEvent {
  id: string
  processor: string
  eventType: string
  companyId: string | null
  payload: any
  processed: boolean
  processedAt: string | null
  error: string | null
  createdAt: string
  Company?: {
    name: string
  }
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

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null)
  const [filter, setFilter] = useState<'all' | 'processed' | 'failed' | 'pending'>('all')
  const [processorFilter, setProcessorFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h')

  useEffect(() => {
    fetchWebhooks()
  }, [filter, processorFilter, timeRange])

  const fetchWebhooks = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('filter', filter)
      if (processorFilter !== 'all') params.set('processor', processorFilter)
      params.set('timeRange', timeRange)
      
      const res = await fetch(withViewAs(`/api/admin/integrations/webhooks?${params.toString()}`))
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      }
    } catch (error) {
      console.error('Failed to fetch webhooks:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getStatusBadge = (event: WebhookEvent) => {
    if (event.error) {
      return <Badge className="bg-red-100 text-red-700 border border-red-300">Failed</Badge>
    }
    if (event.processed) {
      return <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300">Processed</Badge>
    }
    return <Badge className="bg-amber-100 text-amber-700 border border-amber-300">Pending</Badge>
  }

  const getProcessorBadge = (processor: string) => {
    const colors: Record<string, string> = {
      'ghl_marketplace': 'bg-blue-100 text-blue-700 border border-blue-300',
      'ghl': 'bg-purple-100 text-purple-700 border border-purple-300',
      'whop': 'bg-green-100 text-green-700 border border-green-300',
      'zoom': 'bg-indigo-100 text-indigo-700 border border-indigo-300',
      'clerk': 'bg-gray-100 text-gray-700 border border-gray-300'
    }
    return (
      <Badge className={colors[processor] || 'bg-gray-100 text-gray-700 border border-gray-300'}>
        {processor}
      </Badge>
    )
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Webhook Events</h1>
          <p className="text-gray-700 text-sm">View and debug incoming webhook data</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-white border border-gray-200 mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="text-xs text-gray-700 mb-1 block">Status</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700"
              >
                <option value="all">All</option>
                <option value="processed">Processed</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">Processor</label>
              <select
                value={processorFilter}
                onChange={(e) => setProcessorFilter(e.target.value)}
                className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700"
              >
                <option value="all">All</option>
                <option value="ghl_marketplace">GHL Marketplace</option>
                <option value="ghl">GHL (Legacy)</option>
                <option value="whop">Whop</option>
                <option value="zoom">Zoom</option>
                <option value="clerk">Clerk</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">Time Range</label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700"
              >
                <option value="1h">Last Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
              </select>
            </div>
            <div className="ml-auto">
              <Button
                onClick={fetchWebhooks}
                variant="outline"
                size="sm"
                className="border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events List */}
      {loading ? (
        <p className="text-gray-700">Loading webhook events...</p>
      ) : events.length === 0 ? (
        <Card className="bg-white border border-gray-200">
          <CardContent className="p-8 text-center">
            <p className="text-gray-700">No webhook events found for the selected filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card
              key={event.id}
              className="bg-white border border-gray-200 hover:border-gray-300 transition cursor-pointer"
              onClick={() => setSelectedEvent(event)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getProcessorBadge(event.processor)}
                      {getStatusBadge(event)}
                      <span className="text-sm text-gray-900 font-medium">{event.eventType}</span>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>Received: {formatDate(event.createdAt)}</p>
                      {event.processedAt && (
                        <p>Processed: {formatDate(event.processedAt)}</p>
                      )}
                      {event.Company && (
                        <p>Company: {event.Company.name}</p>
                      )}
                      {event.error && (
                        <p className="text-red-600">Error: {event.error}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedEvent(event)
                    }}
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    View Payload
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Payload Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <Card
            className="bg-white border border-gray-200 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b border-gray-200">
              <div className="flex items-center justify-between">
                <CardTitle className="text-gray-900">Webhook Event Details</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-600 hover:text-gray-900"
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 overflow-auto flex-1">
              <div className="space-y-4 mb-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Event ID</p>
                  <p className="text-sm text-gray-900 font-mono">{selectedEvent.id}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Processor</p>
                    <p className="text-sm text-gray-900">{selectedEvent.processor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Event Type</p>
                    <p className="text-sm text-gray-900">{selectedEvent.eventType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Status</p>
                    {getStatusBadge(selectedEvent)}
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Received</p>
                    <p className="text-sm text-gray-900">{formatDate(selectedEvent.createdAt)}</p>
                  </div>
                </div>
                {selectedEvent.error && (
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Error</p>
                    <p className="text-sm text-red-700 bg-red-50 p-2 rounded border border-red-200">
                      {selectedEvent.error}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-2">Full Payload</p>
                <pre className="bg-gray-50 p-4 rounded border border-gray-200 overflow-auto text-xs text-gray-900">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


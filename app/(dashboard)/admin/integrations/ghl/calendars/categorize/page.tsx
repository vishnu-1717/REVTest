'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Calendar {
  id: string
  name: string
  trafficSource: string | null
  calendarType: string | null
}

export default function CategorizeCalendarsPage() {
  const router = useRouter()
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  
  const withViewAs = (url: string) => {
    if (typeof window === 'undefined') return url
    const params = new URLSearchParams(window.location.search)
    const viewAs = params.get('viewAs')
    if (!viewAs) return url
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}viewAs=${viewAs}`
  }
  
  useEffect(() => {
    fetchCalendars()
  }, [])
  
  const fetchCalendars = async () => {
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/ghl/calendars'))
      const data = await res.json()
      setCalendars(data)
    } catch (error) {
      console.error('Failed to fetch calendars:', error)
    }
    setLoading(false)
  }
  
  const handleSyncCalendars = async () => {
    setSyncing(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/ghl/calendars'), {
        method: 'POST'
      })
      
      if (!res.ok) {
        alert('Failed to sync calendars')
        return
      }
      
      const data = await res.json()
      console.log(`Synced ${data.count} calendars`)
      
      // Refresh the list
      await fetchCalendars()
      alert(`✅ Synced ${data.count} calendars successfully!`)
    } catch (error) {
      console.error('Failed to sync calendars:', error)
      alert('Failed to sync calendars')
    } finally {
      setSyncing(false)
    }
  }
  
  const handleSave = async () => {
    setSaving(true)
    try {
      // Update each calendar
      await Promise.all(
        calendars.map(cal =>
          fetch(withViewAs(`/api/admin/integrations/ghl/calendars/${cal.id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trafficSource: cal.trafficSource,
              calendarType: cal.calendarType
            })
          })
        )
      )
      
      alert('✅ Calendars configured!')
      router.push('/dashboard')
    } catch (error) {
      alert('Failed to save calendars')
    }
    setSaving(false)
  }
  
  const autoExtractSource = (name: string): string => {
    // Try to extract from patterns like "Name (SOURCE)"
    const match = name.match(/\(([^)]+)\)$/)
    return match ? match[1] : ''
  }
  
  if (loading) {
    return <div className="container mx-auto py-10">Loading calendars...</div>
  }
  
  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Categorize Calendars</h1>
            <p className="text-gray-600">
              Tell us which traffic source each calendar represents
            </p>
          </div>
          <Button 
            onClick={handleSyncCalendars}
            disabled={syncing}
            variant="outline"
          >
            {syncing ? 'Syncing...' : '🔄 Sync Calendars'}
          </Button>
        </div>
      </div>
      
      <div className="space-y-4 mb-8">
        {calendars.map((cal, index) => (
          <Card key={cal.id}>
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium mb-1">{cal.name}</p>
                  <Input
                    placeholder="e.g. Meta, Google, Organic Instagram"
                    value={cal.trafficSource || ''}
                    onChange={(e) => {
                      const updated = [...calendars]
                      updated[index].trafficSource = e.target.value
                      setCalendars(updated)
                    }}
                  />
                </div>
                
                {!cal.trafficSource && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const extracted = autoExtractSource(cal.name)
                      if (extracted) {
                        const updated = [...calendars]
                        updated[index].trafficSource = extracted
                        setCalendars(updated)
                      }
                    }}
                  >
                    Auto-Extract
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Saving...' : 'Save & Finish ✓'}
        </Button>
        <Button 
          variant="outline" 
          onClick={() => router.push('/dashboard')}
        >
          Skip for Now
        </Button>
      </div>
    </div>
  )
}

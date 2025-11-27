'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface PendingPCN {
  appointmentId: string
  contactName: string
  contactEmail: string | null
  closerName: string
  scheduledAt: string
  aiGeneratedPCN: any
  aiGeneratedAt: string
}

export default function PCNQAPage() {
  const [pendingPCNs, setPendingPCNs] = useState<PendingPCN[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPCN, setSelectedPCN] = useState<PendingPCN | null>(null)
  const [changelog, setChangelog] = useState<any[]>([])

  useEffect(() => {
    loadPendingPCNs()
  }, [])

  const loadPendingPCNs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pcn-qa')
      if (res.ok) {
        const data = await res.json()
        setPendingPCNs(data.pendingPCNs || [])
      }
    } catch (error) {
      console.error('Failed to load pending PCNs:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadChangelog = async (appointmentId: string) => {
    try {
      const res = await fetch(`/api/admin/pcn-qa?appointmentId=${appointmentId}`)
      if (res.ok) {
        const data = await res.json()
        setChangelog(data.changelog || [])
      }
    } catch (error) {
      console.error('Failed to load changelog:', error)
    }
  }

  const handleApprove = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to approve and submit this PCN?')) {
      return
    }

    try {
      const res = await fetch(`/api/admin/pcn-qa/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId })
      })

      if (res.ok) {
        alert('PCN approved and submitted successfully!')
        loadPendingPCNs()
        setSelectedPCN(null)
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to approve PCN')
      }
    } catch (error) {
      console.error('Failed to approve PCN:', error)
      alert('Failed to approve PCN')
    }
  }

  const handleReject = async (appointmentId: string) => {
    const reason = prompt('Please provide a reason for rejection:')
    if (!reason) return

    try {
      const res = await fetch(`/api/admin/pcn-qa/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, reason })
      })

      if (res.ok) {
        alert('PCN rejected successfully!')
        loadPendingPCNs()
        setSelectedPCN(null)
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to reject PCN')
      }
    } catch (error) {
      console.error('Failed to reject PCN:', error)
      alert('Failed to reject PCN')
    }
  }

  const formatPCNData = (pcn: any): string => {
    if (!pcn) return 'No data'
    
    let formatted = ''
    if (pcn.callOutcome) formatted += `Outcome: ${pcn.callOutcome}\n`
    if (pcn.cashCollected) formatted += `Cash Collected: $${pcn.cashCollected}\n`
    if (pcn.qualificationStatus) formatted += `Qualification: ${pcn.qualificationStatus}\n`
    if (pcn.notes) formatted += `Notes: ${pcn.notes}\n`
    
    return formatted || JSON.stringify(pcn, null, 2)
  }

  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">PCN QA Dashboard</h1>
      <p className="text-gray-600 mb-8">Review and approve AI-generated PCNs</p>

      {pendingPCNs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            No pending AI-generated PCNs to review
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* List of pending PCNs */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Pending Review ({pendingPCNs.length})</h2>
            {pendingPCNs.map((pcn) => (
              <Card
                key={pcn.appointmentId}
                className={`cursor-pointer hover:border-blue-500 ${
                  selectedPCN?.appointmentId === pcn.appointmentId ? 'border-blue-500' : ''
                }`}
                onClick={() => {
                  setSelectedPCN(pcn)
                  loadChangelog(pcn.appointmentId)
                }}
              >
                <CardHeader>
                  <CardTitle className="text-lg">
                    {pcn.contactName}
                    {pcn.aiGeneratedPCN?.callOutcome && (
                      <Badge className="ml-2">{pcn.aiGeneratedPCN.callOutcome}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Closer: {pcn.closerName}
                  </p>
                  <p className="text-sm text-gray-600">
                    Scheduled: {new Date(pcn.scheduledAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Generated: {new Date(pcn.aiGeneratedAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* PCN Details */}
          {selectedPCN && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Review PCN</h2>
              <Card>
                <CardHeader>
                  <CardTitle>{selectedPCN.contactName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Contact Info</h3>
                    <p>Email: {selectedPCN.contactEmail || 'N/A'}</p>
                    <p>Closer: {selectedPCN.closerName}</p>
                    <p>Scheduled: {new Date(selectedPCN.scheduledAt).toLocaleString()}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">AI-Generated PCN Data</h3>
                    <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                      {formatPCNData(selectedPCN.aiGeneratedPCN)}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Changelog</h3>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {changelog.length === 0 ? (
                        <p className="text-sm text-gray-500">No changelog entries</p>
                      ) : (
                        changelog.map((entry, idx) => (
                          <div key={idx} className="text-xs bg-gray-50 p-2 rounded">
                            <p className="font-semibold">{entry.action} by {entry.actorName || 'System'}</p>
                            <p className="text-gray-600">{new Date(entry.createdAt).toLocaleString()}</p>
                            {entry.notes && <p className="text-gray-500 mt-1">{entry.notes}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={() => handleApprove(selectedPCN.appointmentId)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Approve & Submit
                    </Button>
                    <Button
                      onClick={() => handleReject(selectedPCN.appointmentId)}
                      variant="outline"
                      className="border-red-500 text-red-600 hover:bg-red-50"
                    >
                      Reject
                    </Button>
                    <Button
                      onClick={() => window.open(`/pcn/${selectedPCN.appointmentId}`, '_blank')}
                      variant="outline"
                    >
                      Edit in Form
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


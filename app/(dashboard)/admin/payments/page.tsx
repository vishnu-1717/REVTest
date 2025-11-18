'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface UnmatchedPayment {
  id: string
  sale: {
    id: string
    amount: number
    customerName: string | null
    customerEmail: string | null
    externalId: string
    processor: string
    paidAt: string | null
  }
  suggestedMatches: any[]
  createdAt: string
}

interface AppointmentOption {
  id: string
  contactName: string
  contactEmail: string | null
  closerName: string
  scheduledAt: string
  cashCollected: number | null
  status: string
}

export default function UnmatchedPaymentsPage() {
  const [payments, setPayments] = useState<UnmatchedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPayment, setSelectedPayment] = useState<UnmatchedPayment | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AppointmentOption[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [recentOnly, setRecentOnly] = useState(true)
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set())
  const [bulkMatches, setBulkMatches] = useState<Record<string, string>>({}) // paymentId -> appointmentId
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkMatching, setBulkMatching] = useState(false)
  
  useEffect(() => {
    fetchPayments()
  }, [])
  
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50'
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50'
    return 'text-orange-600 bg-orange-50'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return 'Very High'
    if (confidence >= 0.8) return 'High'
    if (confidence >= 0.6) return 'Medium'
    return 'Low'
  }

  const getSelectedAppointmentData = () => {
    if (!selectedAppointment || !selectedPayment) return null
    
    // Check if it's in suggested matches
    const suggestedMatch = selectedPayment.suggestedMatches?.find(
      (m: any) => (m.id || m.appointmentId) === selectedAppointment
    )
    
    // Check if it's in search results
    const searchMatch = searchResults.find(apt => apt.id === selectedAppointment)
    
    return suggestedMatch || searchMatch || null
  }

  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/admin/unmatched-payments')
      if (!res.ok) {
        throw new Error('Failed to fetch payments')
      }
      const data = await res.json()
      setPayments(data)
    } catch (error) {
      console.error('Failed to fetch payments:', error)
    }
    setLoading(false)
  }
  
  const searchAppointments = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    setSearchLoading(true)
    try {
      const paymentDate = selectedPayment?.sale.paidAt || null
      const params = new URLSearchParams({
        q: query,
        limit: '10',
        recentOnly: recentOnly.toString(),
      })
      if (paymentDate) {
        params.append('paymentDate', paymentDate)
      }
      
      const res = await fetch(`/api/admin/appointments/search?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Search failed')
      }
      const data = await res.json()
      setSearchResults(data.appointments || [])
      setShowDropdown(true)
    } catch (error) {
      console.error('Failed to search appointments:', error)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [recentOnly, selectedPayment])

  useEffect(() => {
    if (searchQuery) {
      const timeoutId = setTimeout(() => {
        searchAppointments(searchQuery)
      }, 300) // Debounce search
      return () => clearTimeout(timeoutId)
    } else {
      setSearchResults([])
      setShowDropdown(false)
    }
  }, [searchQuery, searchAppointments])

  const handleSelectAppointment = (appointmentId: string) => {
    setSelectedAppointment(appointmentId)
    setSearchQuery('')
    setSearchResults([])
    setShowDropdown(false)
  }

  const handleTogglePaymentSelection = (paymentId: string) => {
    setSelectedPayments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId)
        // Remove bulk match for this payment
        setBulkMatches(prevMatches => {
          const newMatches = { ...prevMatches }
          delete newMatches[paymentId]
          return newMatches
        })
      } else {
        newSet.add(paymentId)
      }
      return newSet
    })
  }

  const handleBulkMatchSelect = (paymentId: string, appointmentId: string) => {
    setBulkMatches(prev => ({
      ...prev,
      [paymentId]: appointmentId
    }))
  }

  const handleBulkMatch = async () => {
    const matches = Object.entries(bulkMatches)
      .filter(([paymentId, appointmentId]) => appointmentId && selectedPayments.has(paymentId))
      .map(([paymentId, appointmentId]) => ({
        paymentId,
        appointmentId
      }))

    if (matches.length === 0) {
      alert('Please select appointments for the selected payments')
      return
    }

    setBulkMatching(true)
    try {
      const res = await fetch('/api/admin/unmatched-payments/bulk-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches })
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Bulk match failed')
        return
      }

      const result = await res.json()
      alert(`Successfully matched ${result.successful} of ${result.total} payments${result.failed > 0 ? ` (${result.failed} failed)` : ''}`)
      
      // Reset selections
      setSelectedPayments(new Set())
      setBulkMatches({})
      setShowBulkModal(false)
      fetchPayments()
    } catch (error) {
      console.error('Failed to bulk match payments:', error)
      alert('Failed to bulk match payments')
    } finally {
      setBulkMatching(false)
    }
  }

  const handleMatch = async () => {
    if (!selectedPayment || !selectedAppointment) return
    
    try {
      const res = await fetch(`/api/admin/unmatched-payments/${selectedPayment.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: selectedAppointment })
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error)
        return
      }
      
      alert('Payment matched successfully!')
      setSelectedPayment(null)
      setSelectedAppointment('')
      setSearchQuery('')
      setSearchResults([])
      setShowDropdown(false)
      fetchPayments()
      
    } catch (error) {
      console.error('Failed to match payment:', error)
      alert('Failed to match payment')
    }
  }
  
  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <div className="text-center">Loading...</div>
      </div>
    )
  }
  
  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Unmatched Payments</h1>
        {selectedPayments.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {selectedPayments.size} payment{selectedPayments.size !== 1 ? 's' : ''} selected
            </span>
            <Button
              onClick={() => setShowBulkModal(true)}
              variant="default"
            >
              Bulk Match ({selectedPayments.size})
            </Button>
            <Button
              onClick={() => {
                setSelectedPayments(new Set())
                setBulkMatches({})
              }}
              variant="outline"
            >
              Clear Selection
            </Button>
          </div>
        )}
      </div>
      
      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <p className="text-lg mb-2">🎉 All payments matched!</p>
            <p className="text-sm">No payments need manual review</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="py-6">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedPayments.has(payment.id)}
                      onChange={() => handleTogglePaymentSelection(payment.id)}
                      className="mt-1 rounded"
                    />
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      {selectedPayments.has(payment.id) && bulkMatches[payment.id] && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          Appointment selected for bulk match
                        </span>
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">
                          ${payment.sale.amount.toLocaleString()}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {payment.sale.processor} · {payment.sale.externalId}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Customer:</span>
                        <p className="font-medium">{payment.sale.customerName || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Email:</span>
                        <p className="font-medium">{payment.sale.customerEmail || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Date:</span>
                        <p className="font-medium">
                          {payment.sale.paidAt 
                            ? new Date(payment.sale.paidAt).toLocaleDateString()
                            : 'Unknown'
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Suggested Matches:</span>
                        <p className="font-medium">
                          {Array.isArray(payment.suggestedMatches) 
                            ? payment.suggestedMatches.length 
                            : 0
                          }
                        </p>
                      </div>
                    </div>
                    
                    {Array.isArray(payment.suggestedMatches) && payment.suggestedMatches.length > 0 && (
                      <div className="mt-4 p-4 bg-yellow-50 rounded">
                        <p className="text-sm font-medium text-yellow-800 mb-2">
                          Suggested matches ({payment.suggestedMatches.length}):
                        </p>
                        <div className="space-y-2">
                          {payment.suggestedMatches.map((match: any, idx: number) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium">{match.contactName || match.contact?.name}</span>
                              {' · '}
                              <span className="text-gray-600">
                                ${(match.cashCollected || 0).toLocaleString()}
                              </span>
                              {' · '}
                              <span className="text-gray-600">
                                {match.scheduledAt ? formatDate(match.scheduledAt) : 'Unknown date'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <Button onClick={() => setSelectedPayment(payment)}>
                    Match Manually
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Match Modal */}
      {selectedPayment && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setShowDropdown(false)
          }}
        >
          <Card 
            className="max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>Match Payment to Appointment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Payment Details:</p>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="font-semibold">${selectedPayment.sale.amount.toLocaleString()}</p>
                  <p className="text-sm">{selectedPayment.sale.customerName || 'Unknown'}</p>
                  <p className="text-sm text-gray-600">{selectedPayment.sale.customerEmail || 'No email'}</p>
                </div>
              </div>

              {/* Suggested Matches Section */}
              {Array.isArray(selectedPayment.suggestedMatches) && selectedPayment.suggestedMatches.length > 0 && (
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">
                    Suggested Matches ({selectedPayment.suggestedMatches.length}):
                  </label>
                  <div className="space-y-3 max-h-64 overflow-y-auto border rounded-md p-3">
                    {selectedPayment.suggestedMatches
                      .sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))
                      .map((match: any, idx: number) => {
                        const matchId = match.id || match.appointmentId
                        const isSelected = selectedAppointment === matchId
                        const confidence = match.confidence || 0.5
                        const matchReason = match.matchReason || match.reason || 'Matched'
                        return (
                          <div
                            key={idx}
                            onClick={() => handleSelectAppointment(matchId)}
                            className={`p-3 rounded-md border cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-medium text-sm">
                                    {match.contactName || match.contact?.name || 'Unknown'}
                                  </p>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(confidence)}`}>
                                    {Math.round(confidence * 100)}% - {getConfidenceLabel(confidence)}
                                  </span>
                                </div>
                                {match.contactEmail && (
                                  <p className="text-xs text-gray-600 mt-0.5 truncate">{match.contactEmail}</p>
                                )}
                                <p className="text-xs text-gray-500 mt-1 italic">{matchReason}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                                  <span>Closer: {match.closerName || match.closer?.name || 'Unassigned'}</span>
                                  {match.scheduledAt && (
                                    <span>Scheduled: {formatDate(match.scheduledAt)}</span>
                                  )}
                                  {match.cashCollected && (
                                    <span>Amount: ${match.cashCollected.toLocaleString()}</span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="text-blue-600 text-sm font-medium flex-shrink-0">✓ Selected</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
              
              {/* Searchable Dropdown */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    Search for Appointment:
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recentOnly}
                      onChange={(e) => {
                        setRecentOnly(e.target.checked)
                        if (searchQuery) {
                          // Re-search with new filter
                          setTimeout(() => searchAppointments(searchQuery), 100)
                        }
                      }}
                      className="rounded"
                    />
                    <span>Recent appointments only</span>
                  </label>
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      if (e.target.value) {
                        setShowDropdown(true)
                      }
                    }}
                    onFocus={() => {
                      if (searchResults.length > 0) {
                        setShowDropdown(true)
                      }
                    }}
                    placeholder="Search by name, email, or appointment ID..."
                    className="w-full"
                  />
                  
                  {/* Dropdown Results */}
                  {showDropdown && (searchResults.length > 0 || searchLoading) && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                      {searchLoading ? (
                        <div className="p-4 text-center text-sm text-gray-500">Searching...</div>
                      ) : (
                        searchResults.map((apt) => {
                          const isSelected = selectedAppointment === apt.id
                          return (
                            <div
                              key={apt.id}
                              onClick={() => handleSelectAppointment(apt.id)}
                              className={`p-3 border-b border-gray-100 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{apt.contactName}</p>
                                  {apt.contactEmail && (
                                    <p className="text-xs text-gray-600 mt-0.5">{apt.contactEmail}</p>
                                  )}
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                                    <span>Closer: {apt.closerName}</span>
                                    <span>Scheduled: {formatDate(apt.scheduledAt)}</span>
                                    {apt.cashCollected && (
                                      <span>Amount: ${apt.cashCollected.toLocaleString()}</span>
                                    )}
                                  </div>
                                </div>
                                {isSelected && (
                                  <span className="text-blue-600 text-sm font-medium">✓</span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
                {selectedAppointment && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Appointment selected: {selectedAppointment}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Search by contact name, email, closer name, or appointment ID
                </p>
              </div>

              {/* Visual Comparison Card */}
              {selectedAppointment && selectedPayment && (() => {
                const appointmentData = getSelectedAppointmentData()
                if (!appointmentData) return null
                
                const paymentAmount = selectedPayment.sale.amount
                const appointmentAmount = appointmentData.cashCollected || 0
                const amountMatch = Math.abs(paymentAmount - appointmentAmount) / paymentAmount <= 0.1
                const nameMatch = selectedPayment.sale.customerName && appointmentData.contactName
                  ? selectedPayment.sale.customerName.toLowerCase().trim() === appointmentData.contactName.toLowerCase().trim()
                  : false
                const emailMatch = selectedPayment.sale.customerEmail && appointmentData.contactEmail
                  ? selectedPayment.sale.customerEmail.toLowerCase().trim() === appointmentData.contactEmail.toLowerCase().trim()
                  : false
                
                return (
                  <div className="mb-6 border-2 border-blue-200 rounded-lg bg-blue-50/30 p-4">
                    <h3 className="text-sm font-semibold mb-3 text-gray-700">Comparison</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Payment Side */}
                      <div className="bg-white rounded-md p-3 border border-gray-200">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Payment</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500">Amount:</span>
                            <p className={`font-semibold ${amountMatch ? 'text-green-600' : 'text-gray-900'}`}>
                              ${paymentAmount.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Customer:</span>
                            <p className={`font-medium ${nameMatch ? 'text-green-600' : 'text-gray-900'}`}>
                              {selectedPayment.sale.customerName || 'Unknown'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Email:</span>
                            <p className={`font-medium ${emailMatch ? 'text-green-600' : 'text-gray-900'}`}>
                              {selectedPayment.sale.customerEmail || 'No email'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Date:</span>
                            <p className="text-gray-900">
                              {selectedPayment.sale.paidAt 
                                ? formatDate(selectedPayment.sale.paidAt)
                                : 'Unknown'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Appointment Side */}
                      <div className="bg-white rounded-md p-3 border border-gray-200">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Appointment</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500">Amount:</span>
                            <p className={`font-semibold ${amountMatch ? 'text-green-600' : 'text-gray-900'}`}>
                              {appointmentAmount > 0 
                                ? `$${appointmentAmount.toLocaleString()}`
                                : 'Not set'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Contact:</span>
                            <p className={`font-medium ${nameMatch ? 'text-green-600' : 'text-gray-900'}`}>
                              {appointmentData.contactName || 'Unknown'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Email:</span>
                            <p className={`font-medium ${emailMatch ? 'text-green-600' : 'text-gray-900'}`}>
                              {appointmentData.contactEmail || 'No email'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Scheduled:</span>
                            <p className="text-gray-900">
                              {appointmentData.scheduledAt 
                                ? formatDate(appointmentData.scheduledAt)
                                : 'Unknown'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Closer:</span>
                            <p className="text-gray-900">
                              {appointmentData.closerName || 'Unassigned'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Match Indicators */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex flex-wrap gap-3 text-xs">
                        {amountMatch && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">✓ Amount matches</span>
                        )}
                        {nameMatch && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">✓ Name matches</span>
                        )}
                        {emailMatch && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">✓ Email matches</span>
                        )}
                        {!amountMatch && appointmentAmount > 0 && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                            ⚠ Amount differs by ${Math.abs(paymentAmount - appointmentAmount).toLocaleString()}
                          </span>
                        )}
                        {!nameMatch && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">⚠ Name differs</span>
                        )}
                        {!emailMatch && selectedPayment.sale.customerEmail && appointmentData.contactEmail && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">⚠ Email differs</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
              
              <div className="flex gap-2">
                <Button onClick={handleMatch} disabled={!selectedAppointment}>
                  Match Payment
                </Button>
                <Button
                  onClick={() => {
                    setSelectedPayment(null)
                    setSelectedAppointment('')
                    setSearchQuery('')
                    setSearchResults([])
                    setShowDropdown(false)
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Match Modal */}
      {showBulkModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => !bulkMatching && setShowBulkModal(false)}
        >
          <Card 
            className="max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>Bulk Match Payments</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Match {selectedPayments.size} selected payment{selectedPayments.size !== 1 ? 's' : ''} to appointments
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {Array.from(selectedPayments).map((paymentId) => {
                  const payment = payments.find(p => p.id === paymentId)
                  if (!payment) return null
                  
                  const selectedAppointmentId = bulkMatches[paymentId]
                  
                  return (
                    <div key={paymentId} className="border rounded-lg p-4 bg-gray-50">
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-semibold">${payment.sale.amount.toLocaleString()}</p>
                            <p className="text-sm text-gray-600">{payment.sale.customerName || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{payment.sale.customerEmail || 'No email'}</p>
                          </div>
                          {selectedAppointmentId && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                              ✓ Matched
                            </span>
                          )}
                        </div>
                        
                        {/* Quick match from suggestions */}
                        {Array.isArray(payment.suggestedMatches) && payment.suggestedMatches.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 mb-1">Suggested matches (click to select):</p>
                            <div className="flex flex-wrap gap-2">
                              {payment.suggestedMatches.slice(0, 3).map((match: any, idx: number) => {
                                const matchId = match.id || match.appointmentId
                                const isSelected = selectedAppointmentId === matchId
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => handleBulkMatchSelect(paymentId, matchId)}
                                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                                      isSelected
                                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                                        : 'bg-white border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    {match.contactName || 'Unknown'} · {match.cashCollected ? `$${match.cashCollected.toLocaleString()}` : 'No amount'}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Manual appointment ID input */}
                        <div className="mt-2">
                          <Input
                            type="text"
                            placeholder="Or enter appointment ID manually..."
                            value={selectedAppointmentId || ''}
                            onChange={(e) => {
                              const aptId = e.target.value.trim()
                              if (aptId) {
                                handleBulkMatchSelect(paymentId, aptId)
                              } else {
                                setBulkMatches(prev => {
                                  const newMatches = { ...prev }
                                  delete newMatches[paymentId]
                                  return newMatches
                                })
                              }
                            }}
                            className="w-full text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <Button 
                  onClick={handleBulkMatch} 
                  disabled={bulkMatching || Object.keys(bulkMatches).length === 0}
                >
                  {bulkMatching ? 'Matching...' : `Match ${Object.keys(bulkMatches).length} Payment${Object.keys(bulkMatches).length !== 1 ? 's' : ''}`}
                </Button>
                <Button
                  onClick={() => {
                    setShowBulkModal(false)
                    if (!bulkMatching) {
                      setSelectedPayments(new Set())
                      setBulkMatches({})
                    }
                  }}
                  variant="outline"
                  disabled={bulkMatching}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


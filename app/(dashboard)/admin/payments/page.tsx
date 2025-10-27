'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

export default function UnmatchedPaymentsPage() {
  const [payments, setPayments] = useState<UnmatchedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPayment, setSelectedPayment] = useState<UnmatchedPayment | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<string>('')
  
  useEffect(() => {
    fetchPayments()
  }, [])
  
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
      <h1 className="text-3xl font-bold mb-8">Unmatched Payments</h1>
      
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
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
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
                          Possible matches:
                        </p>
                        <div className="space-y-2">
                          {payment.suggestedMatches.map((match: any, idx: number) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium">{match.contact?.name}</span>
                              {' · '}
                              <span className="text-gray-600">
                                ${match.cashCollected?.toLocaleString()}
                              </span>
                              {' · '}
                              <span className="text-gray-600">
                                {new Date(match.scheduledAt).toLocaleDateString()}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-2xl w-full mx-4">
            <CardHeader>
              <CardTitle>Match Payment to Appointment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Payment Details:</p>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="font-semibold">${selectedPayment.sale.amount.toLocaleString()}</p>
                  <p className="text-sm">{selectedPayment.sale.customerName}</p>
                  <p className="text-sm text-gray-600">{selectedPayment.sale.customerEmail}</p>
                </div>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  Select Appointment ID:
                </label>
                <input
                  type="text"
                  value={selectedAppointment}
                  onChange={(e) => setSelectedAppointment(e.target.value)}
                  placeholder="Paste appointment ID here"
                  className="w-full border rounded-md p-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can find the appointment ID in the appointments list
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleMatch} disabled={!selectedAppointment}>
                  Match Payment
                </Button>
                <Button
                  onClick={() => {
                    setSelectedPayment(null)
                    setSelectedAppointment('')
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
    </div>
  )
}


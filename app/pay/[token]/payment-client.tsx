'use client'

import { useEffect } from 'react'

interface PaymentPageClientProps {
  token: string
  paymentLink: any
  stripeUrl: string
  whopUrl: string
}

export default function PaymentPageClient({
  token,
  paymentLink,
  stripeUrl,
  whopUrl
}: PaymentPageClientProps) {
  // Track the open when component mounts
  useEffect(() => {
    async function trackOpen() {
      try {
        await fetch(`/api/payment-links/${token}/track`, { method: 'POST' })
      } catch (error) {
        console.error('Failed to track payment link open:', error)
      }
    }
    
    trackOpen()
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-2xl w-full bg-white p-8 rounded-lg shadow">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Complete Your Payment</h1>
          <p className="text-gray-600">
            {paymentLink.company.name}
          </p>
        </div>
        
        <div className="border-t border-b py-6 mb-6">
          <div className="flex justify-between mb-4">
            <span className="text-gray-600">Customer:</span>
            <span className="font-semibold">{paymentLink.appointment.contact.name}</span>
          </div>
          <div className="flex justify-between mb-4">
            <span className="text-gray-600">Email:</span>
            <span className="font-semibold">{paymentLink.appointment.contact.email || 'N/A'}</span>
          </div>
          <div className="flex justify-between mb-4">
            <span className="text-gray-600">Amount:</span>
            <span className="font-semibold text-2xl">
              ${paymentLink.amount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Payment Type:</span>
            <span className="font-semibold capitalize">
              {paymentLink.paymentType.replace('_', ' ')}
            </span>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-800 mb-2">
              <strong>Note:</strong> In production, this page would automatically redirect to your payment processor.
            </p>
            <p className="text-sm text-blue-600">
              The appointment ID ({paymentLink.appointmentId}) will be passed to the payment processor
              so we can automatically attribute this payment to {paymentLink.appointment.closer?.name || 'your sales representative'}.
            </p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-500 mb-2">Example Stripe URL (with metadata):</p>
            <code className="text-xs bg-white p-2 block rounded break-all">
              {stripeUrl}
            </code>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-500 mb-2">Example Whop URL (with metadata):</p>
            <code className="text-xs bg-white p-2 block rounded break-all">
              {whopUrl}
            </code>
          </div>
          
          <button
            onClick={() => alert('In production, this would redirect to your payment processor')}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Proceed to Payment
          </button>
          
          <p className="text-center text-sm text-gray-500">
            Secure payment powered by {paymentLink.company.processor}
          </p>
        </div>
      </div>
    </div>
  )
}


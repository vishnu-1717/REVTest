import { withPrisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import PaymentPageClient from './payment-client'

export default async function PaymentPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  
  // Get payment link
  const paymentLink = await withPrisma(async (prisma) => {
    const link = await prisma.paymentLink.findUnique({
      where: { token },
      include: {
        appointment: {
          include: {
            contact: true,
            closer: true
          }
        },
        company: true
      }
    })
    
    return link
  })
  
  if (!paymentLink) {
    notFound()
  }
  
  // Check if expired
  if (paymentLink.expiresAt && new Date() > paymentLink.expiresAt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Link Expired</h1>
          <p className="text-gray-600">
            This payment link has expired. Please contact your sales representative.
          </p>
        </div>
      </div>
    )
  }
  
  // Check if already paid
  if (paymentLink.status === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow">
          <h1 className="text-2xl font-bold text-green-600 mb-4">Already Paid</h1>
          <p className="text-gray-600">
            This payment has already been completed. Thank you!
          </p>
        </div>
      </div>
    )
  }
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  // Construct payment processor URL with metadata
  // Example for Stripe:
  const stripeUrl = `https://buy.stripe.com/test_xxxxx?` + 
    `client_reference_id=${paymentLink.appointmentId}&` +
    `prefilled_email=${paymentLink.appointment.contact.email || ''}`
  
  // Example for Whop:
  const whopUrl = `https://whop.com/checkout/xxxxx?` +
    `metadata[appointment_id]=${paymentLink.appointmentId}&` +
    `email=${paymentLink.appointment.contact.email || ''}`
  
  return (
    <PaymentPageClient 
      token={token}
      paymentLink={paymentLink}
      stripeUrl={stripeUrl}
      whopUrl={whopUrl}
    />
  )
}


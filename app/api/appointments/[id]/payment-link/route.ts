import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const { amount, paymentType, expiresInDays } = await request.json()
    
    const result = await withPrisma(async (prisma) => {
      // Get the appointment
      const appointment = await prisma.appointment.findFirst({
        where: {
          id,
          companyId: user.companyId
        },
        include: {
          contact: true,
          closer: true
        }
      })
      
      if (!appointment) {
        throw new Error('Appointment not found')
      }
      
      // Generate unique token
      const token = randomBytes(32).toString('hex')
      
      // Calculate expiration
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null
      
      // Create payment link
      const paymentLink = await prisma.paymentLink.create({
        data: {
          token,
          appointmentId: appointment.id,
          companyId: user.companyId,
          amount: parseFloat(amount),
          paymentType,
          expiresAt,
          status: 'pending'
        }
      })
      
      // Generate the actual URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const paymentUrl = `${baseUrl}/pay/${token}`
      
      return {
        ...paymentLink,
        url: paymentUrl
      }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    console.error('Payment link creation error:', error)
    if (error.message === 'Appointment not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    
    const links = await withPrisma(async (prisma) => {
      // Get all payment links for this appointment
      const links = await prisma.paymentLink.findMany({
        where: {
          appointmentId: id,
          companyId: user.companyId
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
      
      return links
    })
    
    // Add URLs to each link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const linksWithUrls = links.map(link => ({
      ...link,
      url: `${baseUrl}/pay/${link.token}`
    }))
    
    return NextResponse.json(linksWithUrls)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}


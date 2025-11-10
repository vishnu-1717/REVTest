import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import crypto from 'crypto'

export async function GET() {
  try {
    await requireSuperAdmin()
    
    const companies = await withPrisma(async (prisma) => {
      return await prisma.company.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: {
            select: {
              User: true,
              Appointment: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    })
    
    return NextResponse.json(companies)
  } catch (error: any) {
    console.error('Error fetching companies:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin()

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const processor =
      typeof body.processor === 'string' && body.processor.trim().length > 0
        ? body.processor.trim()
        : 'whop'

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const inviteCode = crypto.randomBytes(8).toString('hex').toUpperCase()
    const generatedEmail = email || `company-${crypto.randomBytes(8).toString('hex')}@paymaestro.com`

    const createdCompany = await withPrisma(async (prisma) => {
      const existing = await prisma.company.findUnique({
        where: { email: generatedEmail }
      })

      if (existing) {
        throw new Error('A company with that contact email already exists')
      }

      return prisma.company.create({
        data: {
          name,
          email: generatedEmail,
          processor,
          processorAccountId: webhookSecret,
          inviteCode
        },
        select: {
          id: true,
          name: true,
          email: true,
          processor: true,
          createdAt: true,
          _count: {
            select: {
              User: true,
              Appointment: true
            }
          }
        }
      })
    })

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000'
    const webhookUrl = `${appUrl}/api/webhooks/${processor}?company=${createdCompany.id}&secret=${webhookSecret}`

    return NextResponse.json({
      company: createdCompany,
      inviteCode,
      webhookUrl
    })
  } catch (error: any) {
    console.error('Error creating company:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create company' },
      { status: 400 }
    )
  }
}


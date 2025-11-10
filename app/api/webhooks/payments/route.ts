import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withPrisma } from '@/lib/db'

type IncomingPayment = {
  processor?: string
  paymentId?: string
  amount?: number | string
  currency?: string
  customerEmail?: string
  customerName?: string
  closerEmail?: string
  companyId?: string
  company_id?: string
  company?: string
  paidAt?: string
  contactPhone?: string
  contactName?: string
  appointmentId?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET

function normalizeString(value?: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length ? str : null
}

function normalizeEmail(value?: unknown): string | null {
  const str = normalizeString(value)
  return str ? str.toLowerCase() : null
}

function parseAmount(amount: number | string | undefined): number | null {
  if (amount === undefined || amount === null) return null
  if (typeof amount === 'number' && Number.isFinite(amount)) return amount
  if (typeof amount === 'string') {
    const cleaned = amount.replace(/[^0-9.-]/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parsePaidAt(value?: string): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const providedSecret = request.headers.get('x-webhook-secret')
    if (providedSecret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
    }
  }

  let payload: IncomingPayment
  try {
    payload = await request.json()
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const processor = normalizeString(payload.processor)
  const paymentId = normalizeString(payload.paymentId)
  const amount = parseAmount(payload.amount)
  const currency = (normalizeString(payload.currency) || 'USD').toUpperCase()
  const customerEmail = normalizeEmail(payload.customerEmail)
  const customerName = normalizeString(payload.customerName)
  const closerEmail = normalizeEmail(payload.closerEmail)
  const paidAt = parsePaidAt(payload.paidAt)
  const contactName = normalizeString(payload.contactName)
  const contactPhone = normalizeString(payload.contactPhone)?.replace(/\D/g, '')
  const appointmentIdHint = normalizeString(payload.appointmentId)
  const metadata =
    payload.metadata && typeof payload.metadata === 'object'
      ? (payload.metadata as Record<string, unknown>)
      : undefined
  const providedCompanyId = normalizeString(payload.companyId ?? payload.company_id ?? payload.company)
  const metadataCompanyId = metadata
    ? normalizeString(
        (metadata.companyId as string | undefined) ??
          (metadata.company_id as string | undefined) ??
          (metadata.company as string | undefined)
      )
    : null
  const initialCompanyId = providedCompanyId ?? metadataCompanyId

  if (!processor || !paymentId || amount === null || !customerEmail) {
    return NextResponse.json(
      { error: 'processor, paymentId, amount, and customerEmail are required' },
      { status: 400 }
    )
  }

  try {
    const result = await withPrisma(async (prisma) => {
      const existingSale = await prisma.sale.findUnique({
        where: { externalId: paymentId },
        select: { id: true, appointmentId: true },
      })

      if (existingSale) {
        return {
          status: 'duplicate',
          saleId: existingSale.id,
          matched: Boolean(existingSale.appointmentId),
        }
      }

      let companyId = initialCompanyId ?? null
      let matchedAppointment: {
        id: string
        contactId: string | null
        closerId: string | null
        companyId: string
      } | null = null
      let closer: { id: string; companyId: string } | null = null

      if (appointmentIdHint) {
        matchedAppointment = await prisma.appointment.findUnique({
          where: {
            id: appointmentIdHint,
          },
          select: {
            id: true,
            contactId: true,
            closerId: true,
            companyId: true,
          },
        })

        if (matchedAppointment) {
          companyId = companyId ?? matchedAppointment.companyId
        }
      }

      if (closerEmail) {
        closer = await prisma.user.findFirst({
          where: {
            email: {
              equals: closerEmail,
              mode: 'insensitive',
            },
            ...(companyId ? { companyId } : {}),
          },
          select: {
            id: true,
            companyId: true,
          },
        })

        if (!closer) {
          return {
            status: 'ignored',
            error: `Closer with email ${closerEmail} not found`,
          }
        }

        companyId = companyId ?? closer.companyId
      }

      if (!companyId) {
        throw new Error('Unable to determine company for payment')
      }

      const contact = await prisma.contact.findFirst({
        where: {
          companyId,
          OR: [
            { email: { equals: customerEmail, mode: 'insensitive' } },
            contactName
              ? { name: { equals: contactName, mode: 'insensitive' } }
              : undefined,
            contactPhone
              ? { phone: { equals: contactPhone } }
              : undefined,
          ].filter(Boolean) as Record<string, unknown>[],
        },
        select: {
          id: true,
        },
      })

      if (!matchedAppointment) {
        const candidates = await prisma.appointment.findMany({
          where: {
            companyId,
            contact: {
              email: { equals: customerEmail, mode: 'insensitive' },
            },
          },
          include: {
            contact: true,
          },
          orderBy: {
            scheduledAt: 'desc',
          },
          take: 10,
        })

        if (candidates.length) {
          matchedAppointment =
            candidates.find((apt) => closer && apt.closerId === closer.id) ??
            candidates[0]
        }
      }

      const saleData = {
        amount,
        currency,
        status: 'paid' as const,
        processor,
        externalId: paymentId,
        paidAt,
        companyId,
        appointmentId: matchedAppointment?.id ?? null,
        contactId: matchedAppointment?.contactId ?? contact?.id ?? null,
        repId: closer?.id ?? matchedAppointment?.closerId ?? null,
        customerEmail,
        customerName: customerName ?? undefined,
        matchedBy: matchedAppointment ? 'webhook' : null,
        matchConfidence: matchedAppointment ? 1 : null,
        manuallyMatched: false,
        rawData: payload as Prisma.JsonObject,
      }

      const sale = await prisma.sale.create({
        data: saleData,
        select: {
          id: true,
          appointmentId: true,
        },
      })

      if (!matchedAppointment) {
        const unmatched = await prisma.unmatchedPayment.create({
          data: {
            saleId: sale.id,
            companyId,
            suggestedMatches: [],
          },
          select: { id: true },
        })

        return {
          status: 'unmatched',
          matched: false,
          saleId: sale.id,
          unmatchedPaymentId: unmatched.id,
        }
      }

      return {
        status: 'matched',
        matched: true,
        saleId: sale.id,
        appointmentId: matchedAppointment.id,
      }
    })

    const status = result.status === 'matched' ? 200 : result.status === 'duplicate' ? 200 : 202
    return NextResponse.json(result, { status })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unable to determine company for payment') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Payment Webhook] Error processing payment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


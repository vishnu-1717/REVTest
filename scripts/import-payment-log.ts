import fs from 'node:fs/promises'
import path from 'node:path'
import Papa from 'papaparse'
import { prisma } from '../lib/prisma'

type PaymentRow = {
  Date?: string
  Closer?: string
  'Contact Name'?: string
  Phone?: string
  Email?: string
  Amount?: string
  Client?: string
  Detail?: string
  'Payment ID'?: string
  Calendar?: string
  Notes?: string
  'Refund Detail'?: string
  'Email from Closed Deal'?: string
  'Date Helper'?: string
  [key: string]: string | undefined
}

function normalizeString(value?: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function normalizeEmail(value?: string): string | null {
  const email = normalizeString(value)
  return email ? email.toLowerCase() : null
}

function parseAmount(raw?: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : null
}

function parseDate(raw?: string): Date | null {
  const value = normalizeString(raw)
  if (!value) return null

  // Expected format: M/D/YYYY HH:mm:ss (24-hour) or M/D/YYYY
  const [datePart, timePart = '00:00:00'] = value.split(' ')
  const [monthStr, dayStr, yearStr] = datePart.split('/')
  if (!monthStr || !dayStr || !yearStr) return null

  const month = Number(monthStr)
  const day = Number(dayStr)
  const year = Number(yearStr)

  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) {
    return null
  }

  const [hourStr = '0', minuteStr = '0', secondStr = '0'] = timePart.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const second = Number((secondStr || '0').replace(/[^0-9]/g, ''))

  if ([hour, minute, second].some((n) => !Number.isFinite(n))) {
    return null
  }

  // Interpret timestamps as UTC to avoid timezone ambiguity.
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second))
}

async function findMatchingAppointment(params: {
  companyId: string
  emailCandidates: (string | null)[]
  phone?: string | null
  name?: string | null
  closerEmail?: string | null
}) {
  const { companyId, emailCandidates, phone, name, closerEmail } = params

  const orClauses = []

  for (const email of emailCandidates) {
    if (email) {
      orClauses.push({
        contact: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      })
    }
  }

  if (phone) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length) {
      orClauses.push({
        contact: {
          phone: {
            equals: digits,
          },
        },
      })
    }
  }

  if (name) {
    orClauses.push({
      contact: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    })
  }

  if (orClauses.length === 0) {
    return null
  }

  const sharedWhere = {
    companyId,
    OR: orClauses as unknown[],
  }

  if (closerEmail) {
    const appointment = await prisma.appointment.findFirst({
      where: {
        ...sharedWhere,
        closer: {
          email: {
            equals: closerEmail,
            mode: 'insensitive',
          },
        },
      },
      orderBy: {
        scheduledAt: 'desc',
      },
      include: {
        contact: true,
      },
    })

    if (appointment) {
      return appointment
    }
  }

  return prisma.appointment.findFirst({
    where: sharedWhere,
    orderBy: {
      scheduledAt: 'desc',
    },
    include: {
      contact: true,
    },
  })
}

async function main() {
  const csvPath = path.resolve(
    '/Users/benjamincrabb/Downloads/Budgetdog Sales Tracker (PCN, KPI, metrics) - Payment Log.csv'
  )

  const [fileContent, company, closers] = await Promise.all([
    fs.readFile(csvPath, 'utf8'),
    prisma.company.findFirst({
      where: { name: { equals: 'BudgetDog', mode: 'insensitive' } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { Company: { name: { equals: 'BudgetDog', mode: 'insensitive' } } },
      select: { id: true, email: true },
    }),
  ])

  if (!company) {
    throw new Error('BudgetDog company not found')
  }

  const closerMap = new Map<string, string>()
  for (const closer of closers) {
    if (closer.email) {
      closerMap.set(closer.email.toLowerCase(), closer.id)
    }
  }

  const parsed = Papa.parse<PaymentRow>(fileContent, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors.length) {
    console.error('CSV parse errors detected:', parsed.errors)
  }

  const rows = parsed.data

  let insertedCount = 0
  let skippedLoggedCount = 0
  let skippedMissingAppointment = 0
  let existingCount = 0
  let insertedAmount = 0
  let skippedLoggedAmount = 0
  let unmatchedCreated = 0
  let unmatchedAmount = 0
 
  const unmatched: PaymentRow[] = []
  const remainingLoggedByAppointment = new Map<string, number>()
  const EPSILON = 0.01

  for (const row of rows) {
    const amount = parseAmount(row.Amount)
    if (!amount) continue
    let saleAmount = amount

    const paidAt = parseDate(row.Date)
    const closerEmail = normalizeEmail(row.Closer)
    const contactName = normalizeString(row['Contact Name'])
    const phone = normalizeString(row.Phone)
    const primaryEmail = normalizeEmail(row.Email)
    const alternateEmail = normalizeEmail(row['Email from Closed Deal'])
    const emailCandidates = Array.from(new Set([primaryEmail, alternateEmail]))

    const appointment = await findMatchingAppointment({
      companyId: company.id,
      emailCandidates,
      phone,
      name: contactName,
      closerEmail,
    })

    if (!appointment) {
      unmatched.push(row)
      skippedMissingAppointment += 1

      const externalId =
        normalizeString(row['Payment ID']) ??
        `budgetdog-paymentlog:${row.Date ?? 'unknown'}|${primaryEmail ?? ''}|${alternateEmail ?? ''}|${amount}`

      // Ensure we only create one sale/unmatched entry per externalId
      let sale = await prisma.sale.findUnique({
        where: { externalId },
        select: { id: true },
      })

      if (!sale) {
        const contact = primaryEmail
          ? await prisma.contact.findFirst({
              where: {
                companyId: company.id,
                email: { equals: primaryEmail, mode: 'insensitive' },
              },
              select: { id: true },
            })
          : null

        sale = await prisma.sale.create({
          data: {
            amount,
            currency: 'USD',
            status: 'paid',
            processor: normalizeString(row.Detail) ?? 'unknown',
            externalId,
            paidAt,
            companyId: company.id,
            contactId: contact?.id ?? undefined,
            customerEmail: primaryEmail ?? alternateEmail ?? undefined,
            customerName: contactName ?? undefined,
            rawData: row as Record<string, unknown>,
          },
          select: { id: true },
        })

        await prisma.unmatchedPayment.create({
          data: {
            saleId: sale.id,
            companyId: company.id,
            suggestedMatches: [],
          },
        })

        unmatchedCreated += 1
        unmatchedAmount += amount
      }

      continue
    }

    let loggedRemaining = remainingLoggedByAppointment.get(appointment.id)
    if (loggedRemaining === undefined) {
      loggedRemaining = appointment.cashCollected ?? 0
    }

    if (loggedRemaining > EPSILON) {
      if (loggedRemaining >= saleAmount - EPSILON) {
        remainingLoggedByAppointment.set(appointment.id, loggedRemaining - saleAmount)
        skippedLoggedCount += 1
        skippedLoggedAmount += saleAmount
        continue
      } else {
        saleAmount -= loggedRemaining
        skippedLoggedCount += 1
        skippedLoggedAmount += loggedRemaining
        loggedRemaining = 0
      }
    }

    remainingLoggedByAppointment.set(appointment.id, loggedRemaining ?? 0)

    if (saleAmount <= EPSILON) {
      continue
    }

    const externalId =
      normalizeString(row['Payment ID']) ??
      `budgetdog-paymentlog:${row.Date ?? 'unknown'}|${primaryEmail ?? ''}|${alternateEmail ?? ''}|${amount}`

    const existingSale = await prisma.sale.findUnique({
      where: { externalId },
      select: { id: true },
    })

    if (existingSale) {
      existingCount += 1
      continue
    }

    const repId = closerEmail ? closerMap.get(closerEmail) ?? null : null

    await prisma.sale.create({
      data: {
        amount: saleAmount,
        currency: 'USD',
        status: 'paid',
        processor: normalizeString(row.Detail) ?? 'unknown',
        externalId,
        paidAt,
        companyId: company.id,
        appointmentId: appointment.id,
        contactId: appointment.contactId,
        repId,
        customerEmail: primaryEmail ?? alternateEmail ?? undefined,
        customerName: contactName ?? undefined,
        rawData: row as Record<string, unknown>,
      },
    })

    insertedCount += 1
    insertedAmount += saleAmount
    remainingLoggedByAppointment.set(appointment.id, 0)
  }

  console.log(`Inserted ${insertedCount} payments totalling $${insertedAmount.toFixed(2)}`)
  console.log(`Skipped ${skippedLoggedCount} rows already logged via PCN (sum: $${skippedLoggedAmount.toFixed(2)})`)
  console.log(`Skipped ${skippedMissingAppointment} rows with no matching appointment`)
  console.log(`Created ${unmatchedCreated} unmatched payments totalling $${unmatchedAmount.toFixed(2)}`)
  console.log(`Existing sales skipped: ${existingCount}`)

  if (unmatched.length > 0) {
    const unmatchedPath = path.resolve('tmp', 'unmatched-payments.json')
    await fs.mkdir(path.dirname(unmatchedPath), { recursive: true })
    await fs.writeFile(unmatchedPath, JSON.stringify(unmatched, null, 2), 'utf8')
    console.log(`Saved ${unmatched.length} unmatched rows to ${unmatchedPath}`)
  }
}

main()
  .catch((error) => {
    console.error('Failed to import payments:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


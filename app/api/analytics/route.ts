import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser, canViewAllData } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { AppointmentWhereClause, AppointmentWithRelations, AnalyticsBreakdownItem } from '@/types'
import { convertDateRangeToUtc, getCompanyTimezone } from '@/lib/timezone'

// Helper types for analytics aggregations
interface ObjectionData {
  type: string
  count: number
  converted: number
  conversionRate?: string | number
  salesCycleTotalDays?: number
  salesCycleCount?: number
  averageSalesCycleDays?: number | null
  leadTimeTotalDays?: number
  leadTimeCount?: number
  averageLeadTimeDays?: number | null
}

interface CalendarBreakdown extends Omit<AnalyticsBreakdownItem, 'showRate' | 'closeRate'> {
  calendar: string
  total: number
}

interface DayBreakdown extends Omit<AnalyticsBreakdownItem, 'showRate' | 'closeRate'> {
  dayOfWeek: number
}

interface TimeBreakdown extends Omit<AnalyticsBreakdownItem, 'showRate' | 'closeRate'> {
  hour: number
}

interface SourceData extends Omit<AnalyticsBreakdownItem, 'showRate' | 'closeRate'> {
  source: string
}

// Local type for closer breakdown with all required fields
interface CloserBreakdownItem {
  closerId: string
  closerEmail: string
  closerName: string
  total: number
  showed: number
  signed: number
  scheduled: number
  cancelled: number
  revenue: number
  salesCycleTotalDays: number
  salesCycleCount: number
  averageSalesCycleDays?: number | null
  leadTimeTotalDays: number
  leadTimeCount: number
  averageLeadTimeDays?: number | null
}

type CloserBreakdownAccumulator = Record<string, CloserBreakdownItem>

// Local type for day breakdown accumulator with all required fields
interface DayBreakdownItem {
  dayOfWeek: number
  dayName: string
  total: number
  showed: number
  signed: number
  scheduled: number
  cancelled: number
  revenue: number
  noShows: number
  salesCycleTotalDays: number
  salesCycleCount: number
  averageSalesCycleDays?: number | null
  leadTimeTotalDays: number
  leadTimeCount: number
  averageLeadTimeDays?: number | null
}

type DayBreakdownAccumulator = Record<string, DayBreakdownItem>

// Local type for calendar breakdown accumulator with all required fields
interface CalendarBreakdownItem {
  calendar: string
  total: number
  showed: number
  signed: number
  scheduled: number
  cancelled: number
  revenue: number
  salesCycleTotalDays: number
  salesCycleCount: number
  averageSalesCycleDays?: number | null
  leadTimeTotalDays: number
  leadTimeCount: number
  averageLeadTimeDays?: number | null
}

type CalendarBreakdownAccumulator = Record<string, CalendarBreakdownItem>

// Local type for traffic source breakdown accumulator with all required fields
interface SourceBreakdownItem {
  source: string
  total: number
  showed: number
  signed: number
  scheduled: number
  cancelled: number
  revenue: number
  salesCycleTotalDays: number
  salesCycleCount: number
  averageSalesCycleDays?: number | null
  leadTimeTotalDays: number
  leadTimeCount: number
  averageLeadTimeDays?: number | null
}

type SourceBreakdownAccumulator = Record<string, SourceBreakdownItem>

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const searchParams = request.nextUrl.searchParams
    const detailMetricRaw = searchParams.get('detail')
    const detailMetric = detailMetricRaw ? detailMetricRaw.toLowerCase() : null
    const detailLimitParam = searchParams.get('detailLimit')
    const detailLimit = detailLimitParam ? Math.max(parseInt(detailLimitParam, 10), 1) : 500
    
    // Get the effective company ID (respects viewAs for super admins)
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: effectiveCompanyId }
      })
    })

    const companyTimezone = getCompanyTimezone(
      company as { timezone?: string | null } | null
    )
    const rawDateFrom = searchParams.get('dateFrom')
    const rawDateTo = searchParams.get('dateTo')
    const { start: scheduledFrom, end: scheduledTo } = convertDateRangeToUtc({
      dateFrom: rawDateFrom,
      dateTo: rawDateTo,
      timezone: companyTimezone
    })
    
    // Build where clause based on filters
    // Note: Date filters apply to scheduledAt for "Scheduled Calls to Date"
    // "Calls Created" will be calculated separately using createdAt
    const where: Partial<AppointmentWhereClause> = {
      companyId: effectiveCompanyId
    }
    
    // If not admin, only show their appointments
    if (!canViewAllData(user)) {
      where.closerId = user.id
    }
    
    // Date filters for scheduledAt (for "Scheduled Calls to Date")
    if (scheduledFrom || scheduledTo) {
      where.scheduledAt = {}
      if (scheduledFrom) {
        where.scheduledAt.gte = scheduledFrom
      }
      if (scheduledTo) {
        where.scheduledAt.lte = scheduledTo
      }
    }
    
    // Status filter
    const statusParam = searchParams.get('status')
    if (statusParam) {
      where.status = statusParam
    }

    // Closer filter
    const closerParam = searchParams.get('closer')
    if (closerParam) {
      where.closerId = closerParam
    }

    // Objection type filter
    const objectionTypeParam = searchParams.get('objectionType')
    if (objectionTypeParam) {
      where.objectionType = {
        contains: objectionTypeParam,
        mode: 'insensitive'
      }
    }
    
    // Appointment type filter (first call vs follow up)
    const appointmentTypeParam = searchParams.get('appointmentType')
    if (appointmentTypeParam) {
      where.isFirstCall = appointmentTypeParam === 'first_call'
    }

    // Follow-up needed filter
    if (searchParams.get('followUpNeeded') === 'true') {
      where.followUpScheduled = true
      where.status = { notIn: ['signed', 'cancelled'] }
    }

    // Nurture type filter
    const nurtureTypeParam = searchParams.get('nurtureType')
    if (nurtureTypeParam) {
      where.nurtureType = {
        contains: nurtureTypeParam,
        mode: 'insensitive'
      }
    }

    // Deal size range filter
    const minDealSize = searchParams.get('minDealSize')
    const maxDealSize = searchParams.get('maxDealSize')
    if (minDealSize || maxDealSize) {
      where.cashCollected = {}
      if (minDealSize) where.cashCollected.gte = parseFloat(minDealSize)
      if (maxDealSize) where.cashCollected.lte = parseFloat(maxDealSize)
    }

    // Calendar filter (traffic source proxy)
    const calendarParam = searchParams.get('calendar')
    if (calendarParam) {
      where.calendar = {
        contains: calendarParam,
        mode: 'insensitive'
      }
    }

    // Traffic source filter
    const trafficSourceParam = searchParams.get('trafficSource')
    if (trafficSourceParam) {
      where.attributionSource = {
        contains: trafficSourceParam,
        mode: 'insensitive'
      }
    }
    
    // PERFORMANCE NOTE: This endpoint loads appointments into memory for complex aggregations.
    // For large datasets (>25k appointments), consider using database-level GROUP BY operations.
    // Current approach prioritizes feature completeness over performance.

    // Safety limit to prevent memory exhaustion
    const ANALYTICS_SAFETY_LIMIT = parseInt(process.env.ANALYTICS_LIMIT || '50000')

    // Get all appointments matching filters (including those with null flag for backwards compatibility)
    const appointments = await withPrisma(async (prisma) => {
      // First, check count to warn if approaching limits
      const totalCount = await prisma.appointment.count({
        where: {
          ...where,
          OR: [
            { appointmentInclusionFlag: 1 },
            { appointmentInclusionFlag: null }
          ]
        } as any
      })

      if (totalCount > ANALYTICS_SAFETY_LIMIT) {
        console.warn(`Analytics query for company ${effectiveCompanyId} exceeds safety limit: ${totalCount} appointments (limit: ${ANALYTICS_SAFETY_LIMIT})`)
      }

      const results = await prisma.appointment.findMany({
        where: {
          ...where,
          // Only include appointments that should be counted (flag = 1 or null for backwards compatibility)
          // Exclude appointments with flag = 0 (superseded)
          OR: [
            { appointmentInclusionFlag: 1 },
            { appointmentInclusionFlag: null }
          ]
        } as any,
        include: {
          closer: true,
          contact: true,
        },
        orderBy: {
          scheduledAt: 'desc'
        },
        // Apply safety limit to prevent memory exhaustion
        // If you hit this limit, results will be truncated. Consider:
        // 1. Narrowing date range
        // 2. Using more specific filters
        // 3. Increasing ANALYTICS_LIMIT env var (with caution)
        // 4. Refactoring to use database aggregations (recommended for 100k+ records)
        take: ANALYTICS_SAFETY_LIMIT
      })
      return results as AppointmentWithRelations[]
    })
    
    // Apply day of week filter if provided (post-query filter)
    let filteredAppointments: AppointmentWithRelations[] = appointments
    if (searchParams.get('dayOfWeek')) {
      const dayOfWeek = parseInt(searchParams.get('dayOfWeek')!)
      filteredAppointments = appointments.filter(apt => 
        new Date(apt.scheduledAt).getDay() === dayOfWeek
      )
    }
    
    // Apply time of day filter if provided
    const timeOfDay = searchParams.get('timeOfDay')
    if (timeOfDay) {
      filteredAppointments = filteredAppointments.filter(apt => {
        // Use startTime if available, otherwise fall back to scheduledAt
        const timeToCheck = apt.startTime || apt.scheduledAt
        const hour = new Date(timeToCheck).getHours()
        switch(timeOfDay) {
          case 'morning': return hour >= 6 && hour < 12
          case 'afternoon': return hour >= 12 && hour < 17
          case 'evening': return hour >= 17 && hour < 21
          case 'night': return hour >= 21 || hour < 6
          default: return true
        }
      })
    }
    
    // Calculate metrics using inclusion flag
    // Filter to only include appointments with flag = 1 (or null for backwards compatibility)
    // Flag = 0 means excluded from analytics (e.g., duplicate, cancelled before showed)
    const countableAppointments = filteredAppointments.filter((a) => {
      const inclusionFlag = (a as any).appointmentInclusionFlag
      return inclusionFlag === 1 || inclusionFlag === null
    }) as AppointmentWithRelations[]
    
    // Calls Created: Number of calls with a Create Date inside the selected time frame
    // This requires a separate query using createdAt instead of scheduledAt
    // Apply all the same filters except date (which uses createdAt)
    let callsCreated = 0
    const createdWhereClause: Partial<AppointmentWhereClause> = {
      companyId: effectiveCompanyId,
      OR: [
        { appointmentInclusionFlag: 1 },
        { appointmentInclusionFlag: null }
      ]
    }
    
    if (!canViewAllData(user)) {
      createdWhereClause.closerId = user.id
    }
    
    // Apply createdAt date filter for Calls Created
    if (scheduledFrom || scheduledTo) {
      createdWhereClause.createdAt = {}
      if (scheduledFrom) {
        createdWhereClause.createdAt.gte = scheduledFrom
      }
      if (scheduledTo) {
        createdWhereClause.createdAt.lte = scheduledTo
      }
    }
    
    // Apply other filters (status, closer, calendar, etc.)
    if (where.status) createdWhereClause.status = where.status
    if (where.closerId && canViewAllData(user)) createdWhereClause.closerId = where.closerId
    if (where.objectionType) createdWhereClause.objectionType = where.objectionType
    if (where.isFirstCall !== undefined) createdWhereClause.isFirstCall = where.isFirstCall
    if (where.followUpScheduled !== undefined) createdWhereClause.followUpScheduled = where.followUpScheduled
    if (where.nurtureType) createdWhereClause.nurtureType = where.nurtureType
    if (where.cashCollected) createdWhereClause.cashCollected = where.cashCollected
    if (where.calendar) createdWhereClause.calendar = where.calendar
    if (where.attributionSource) createdWhereClause.attributionSource = where.attributionSource
    
    callsCreated = await withPrisma(async (prisma) => {
      return await prisma.appointment.count({
        where: createdWhereClause as any
      })
    })

    let callsCreatedAppointments: AppointmentWithRelations[] = []

    if (detailMetric === 'callscreated') {
      callsCreatedAppointments = await withPrisma(async (prisma) => {
        const results = await prisma.appointment.findMany({
          where: createdWhereClause as any,
          include: {
            contact: { select: { name: true } },
            closer: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: detailLimit
        })
        return results as AppointmentWithRelations[]
      })
    }
    
    // Scheduled Calls to Date: Number of calls with a Scheduled Start inside the time frame (flag = 1)
    const scheduledCallsToDate = countableAppointments.length
    
    // Cancelled appointments (within scheduled calls)
    const cancelled = countableAppointments.filter(a => 
      a.status === 'cancelled' || 
      a.outcome === 'Cancelled' || 
      a.outcome === 'cancelled'
    ).length
    
    // Cancellation Rate: Percent of scheduled calls that were canceled
    const cancellationRate = scheduledCallsToDate > 0
      ? ((cancelled / scheduledCallsToDate) * 100).toFixed(1)
      : '0'
    
    // Expected calls: Scheduled minus cancellations
    const expectedCalls = scheduledCallsToDate - cancelled
    
    // Calls Shown: Count of calls that occurred (status = showed)
    const callsShown = countableAppointments.filter(a => a.status === 'showed' || a.status === 'signed').length
    
    // No shows: Appointments with no-show status
    const noShows = countableAppointments.filter(a => 
      a.status === 'no_show' || 
      a.outcome === 'No-showed' || 
      a.outcome === 'no_show'
    ).length
    
    // No Show Rate: Percent of expected calls (scheduled minus cancellations) that did not show
    const noShowRate = expectedCalls > 0
      ? ((noShows / expectedCalls) * 100).toFixed(1)
      : '0'
    
    // Show Rate: Percent of expected calls that showed
    const showRate = expectedCalls > 0
      ? ((callsShown / expectedCalls) * 100).toFixed(1)
      : '0'
    
    // Qualified Calls: Calls where the closer/sales rep made an offer (wasOfferMade = true)
    const qualifiedCalls = countableAppointments.filter(a => a.wasOfferMade === true).length
    
    // Qualified Rate: Qualified Calls ÷ Calls Shown
    const qualifiedRate = callsShown > 0
      ? ((qualifiedCalls / callsShown) * 100).toFixed(1)
      : '0'
    
    // Signed appointments (for backward compatibility)
    const signed = countableAppointments.filter(a => a.status === 'signed').length
    
    // Legacy metrics (for backward compatibility)
    const totalAppointments = countableAppointments.length
    const scheduled = countableAppointments.filter(a => a.status !== 'cancelled').length
    const showed = callsShown
    
    // Calculate missing PCNs (overdue if not submitted by 6PM Eastern on appointment day)
    // Only count appointments with status "scheduled" - all other statuses don't need PCNs
    const isPCNOverdue = (appointment: AppointmentWithRelations): boolean => {
      // Exclude if PCN already submitted
      if (appointment.pcnSubmitted) return false
      
      // Only include appointments with status "scheduled"
      // All other statuses (signed, showed, no_show, cancelled, rescheduled) should not need PCNs
      if (appointment.status !== 'scheduled') return false
      
      // Exclude appointments with flag = 0 (superseded by another appointment)
      // Only count appointments that should be included (flag = 1 or null for backwards compatibility)
      const inclusionFlag = (appointment as any).appointmentInclusionFlag
      if (inclusionFlag === 0) return false
      
      const scheduledDate = new Date(appointment.scheduledAt)
      const now = new Date()
      
      const scheduledDay = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate())
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
      // If scheduled date is in the past, it's overdue
      if (scheduledDay < today) {
        return true
      }
      
      // If scheduled date is today, check if it's past 6PM Eastern (18:00)
      if (scheduledDay.getTime() === today.getTime()) {
        let easternHour = now.getUTCHours() - 5
        if (easternHour < 0) easternHour += 24
        
        return easternHour >= 18 // 6PM Eastern
      }
      
      return false
    }
    
    const overduePCNAppointments = filteredAppointments.filter(isPCNOverdue)
    const missingPCNs = overduePCNAppointments.length
    
    // Calculate revenue from appointments and matched sales
    const revenueFromAppointments = countableAppointments
      .reduce((sum, apt) => sum + (apt.cashCollected || 0), 0)
    
    // Get matched sales for appointments in this date range
    const appointmentIds = countableAppointments.map(a => a.id)
    const matchedSales = await withPrisma(async (prisma) => {
      if (appointmentIds.length === 0) return []
      return await prisma.sale.findMany({
        where: {
          appointmentId: { in: appointmentIds },
          companyId: effectiveCompanyId,
          status: 'paid'
        },
        select: {
          id: true,
          amount: true,
          appointmentId: true,
          paidAt: true
        }
      })
    })
    
    // Filter sales by date range if provided
    let filteredSales = matchedSales
    if (scheduledFrom || scheduledTo) {
      filteredSales = matchedSales.filter(sale => {
        if (!sale.paidAt) return false
        const paidDate = new Date(sale.paidAt)
        if (scheduledFrom && paidDate < scheduledFrom) return false
        if (scheduledTo && paidDate > scheduledTo) return false
        return true
      })
    }
    
    const revenueFromSales = filteredSales.reduce((sum, sale) => {
      return sum + Number(sale.amount)
    }, 0)
    
    // Cash Collected: Total cash collected in the time frame
    const cashCollected = revenueFromAppointments + revenueFromSales
    
    // Total Units Closed: Number of closed deals with a confirmed payment in the time frame
    const totalUnitsClosed = new Set([
      ...countableAppointments.filter(a => a.status === 'signed').map(a => a.id),
      ...filteredSales.map(s => s.appointmentId).filter(Boolean)
    ]).size
    
    // Prepare maps for sales cycle calculations
    const contactIds = Array.from(
      new Set(
        countableAppointments
          .map((apt) => apt.contactId)
          .filter((id): id is string => !!id)
      )
    )

    const contactFirstCallMap = new Map<string, Date>()

    if (contactIds.length > 0) {
      const firstCallResults = await withPrisma(async (prisma) => {
        return await prisma.appointment.groupBy({
          by: ['contactId'],
          where: {
            companyId: effectiveCompanyId,
            contactId: { in: contactIds },
            OR: [
              { appointmentInclusionFlag: 1 },
              { appointmentInclusionFlag: null }
            ]
          } as any,
          _min: {
            scheduledAt: true
          }
        })
      })

      firstCallResults.forEach((result) => {
        if (result.contactId && result._min?.scheduledAt) {
          contactFirstCallMap.set(result.contactId, result._min.scheduledAt)
        }
      })
    }

    const salesByAppointmentId = new Map<
      string,
      { paidAt: Date | null; amount: number }
    >()
    filteredSales.forEach((sale) => {
      if (!sale.appointmentId) return
      const paidAtDate = sale.paidAt ? new Date(sale.paidAt) : null
      const existing = salesByAppointmentId.get(sale.appointmentId)
      if (
        !existing ||
        (paidAtDate &&
          (!existing.paidAt || paidAtDate.getTime() < existing.paidAt.getTime()))
      ) {
        salesByAppointmentId.set(sale.appointmentId, {
          paidAt: paidAtDate,
          amount: Number(sale.amount)
        })
      }
    })

    interface SalesCycleMeta {
      days: number
      firstCallAt: Date
      closedAt: Date
    }

    const appointmentSalesCycleMeta = new Map<string, SalesCycleMeta>()
    let salesCycleTotalDays = 0
    let salesCycleCount = 0

    interface LeadTimeMeta {
      days: number
      createdAt: Date
      startAt: Date
    }

    const appointmentLeadTimeMeta = new Map<string, LeadTimeMeta>()
    let leadTimeTotalDays = 0
    let leadTimeCount = 0

    countableAppointments.forEach((apt) => {
      const hasSignedStatus = apt.status === 'signed'
      const associatedSale = salesByAppointmentId.get(apt.id)

      if (!hasSignedStatus && !associatedSale) {
        return
      }

      const firstCallAt = apt.contactId
        ? contactFirstCallMap.get(apt.contactId)
        : null
      if (!firstCallAt) return

      const closedAt =
        associatedSale?.paidAt ||
        (apt.pcnSubmittedAt ? new Date(apt.pcnSubmittedAt) : null) ||
        (apt.updatedAt ? new Date(apt.updatedAt) : null) ||
        new Date(apt.scheduledAt)

      const diffMs = closedAt.getTime() - firstCallAt.getTime()
      if (diffMs < 0) {
        return
      }

      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      appointmentSalesCycleMeta.set(apt.id, {
        days: diffDays,
        firstCallAt,
        closedAt
      })
      salesCycleTotalDays += diffDays
      salesCycleCount += 1

      if (apt.startTime && apt.createdAt) {
        const startAt = new Date(apt.startTime)
        const createdAt = new Date(apt.createdAt)
        const leadDiffMs = startAt.getTime() - createdAt.getTime()
        if (leadDiffMs >= 0) {
          const leadDiffDays = leadDiffMs / (1000 * 60 * 60 * 24)
          appointmentLeadTimeMeta.set(apt.id, {
            days: leadDiffDays,
            createdAt,
            startAt
          })
          leadTimeTotalDays += leadDiffDays
          leadTimeCount += 1
        }
      }
    })

    const averageSalesCycleDays =
      salesCycleCount > 0
        ? parseFloat((salesCycleTotalDays / salesCycleCount).toFixed(1))
        : null

    const averageLeadTimeDays =
      leadTimeCount > 0
        ? parseFloat((leadTimeTotalDays / leadTimeCount).toFixed(1))
        : null
    
    // Close Rate: Percent of showed calls that closed
    const closeRate = callsShown > 0
      ? ((totalUnitsClosed / callsShown) * 100).toFixed(1)
      : '0'
    
    // Scheduled Calls to Closed: Total Units Closed ÷ Scheduled Calls to Date (as percentage)
    const scheduledCallsToClosed = scheduledCallsToDate > 0
      ? ((totalUnitsClosed / scheduledCallsToDate) * 100).toFixed(1)
      : '0'
    
    // Dollars per Scheduled Call: Cash Collected ÷ Scheduled Calls to Date
    const dollarsOverScheduledCallsToDate = scheduledCallsToDate > 0
      ? (cashCollected / scheduledCallsToDate).toFixed(2)
      : '0'
    
    // Dollars per Showed Call: Cash Collected ÷ Calls Shown
    const dollarsOverShow = callsShown > 0
      ? (cashCollected / callsShown).toFixed(2)
      : '0'
    
    // Legacy metrics (for backward compatibility)
    const totalRevenue = cashCollected
    const avgDealSize = signed > 0 
      ? (cashCollected / signed).toFixed(0)
      : '0'
    
    // Calculate scheduled call/close % (legacy)
    const scheduledCallCloseRate = scheduledCallsToDate > 0 
      ? ((totalUnitsClosed / scheduledCallsToDate) * 100).toFixed(1)
      : '0'
    
    // Revenue per scheduled call (legacy)
    const revenuePerScheduledCall = scheduledCallsToDate > 0
      ? (cashCollected / scheduledCallsToDate).toFixed(2)
      : '0'
    
    // Revenue per showed call (legacy)
    const revenuePerShowedCall = callsShown > 0
      ? (cashCollected / callsShown).toFixed(2)
      : '0'
    
    
    // Group by closer (using countable appointments)
    const byCloser = Object.values(
      countableAppointments.reduce((acc: CloserBreakdownAccumulator, apt) => {
        if (!apt.closer) return acc

        const key = apt.closer.email
        if (!acc[key]) {
          acc[key] = {
            closerId: apt.closer.id,
            closerEmail: apt.closer.email,
            closerName: apt.closer.name,
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            cancelled: 0,
            revenue: 0,
            salesCycleTotalDays: 0,
            salesCycleCount: 0,
            leadTimeTotalDays: 0,
            leadTimeCount: 0
          }
        }

        // Store reference to help TypeScript's control flow analysis
        const closerData = acc[key]!
        closerData.total++
        closerData.scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          closerData.cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          closerData.showed++
        }
        if (apt.status === 'signed') {
          closerData.signed++
          closerData.revenue += apt.cashCollected || 0
        }

        const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
        if (salesCycleMeta) {
          closerData.salesCycleTotalDays += salesCycleMeta.days
          closerData.salesCycleCount += 1
        }

        const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
        if (leadTimeMeta) {
          closerData.leadTimeTotalDays += leadTimeMeta.days
          closerData.leadTimeCount += 1
        }

        return acc
      }, {} as CloserBreakdownAccumulator)
    ).map((closer) => {
      // Calculate expected calls: scheduled - cancelled
      const closerExpectedCalls = closer.scheduled - closer.cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const closerShowRate = closerExpectedCalls > 0
        ? ((closer.showed / closerExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed (legacy calculation for backward compatibility)
      const closerCloseRate = closer.showed > 0 ? ((closer.signed / closer.showed) * 100).toFixed(1) : '0'

      const averageSalesCycleDays =
        closer.salesCycleCount > 0
          ? parseFloat((closer.salesCycleTotalDays / closer.salesCycleCount).toFixed(1))
          : null

      const averageLeadTimeDays =
        closer.leadTimeCount > 0
          ? parseFloat((closer.leadTimeTotalDays / closer.leadTimeCount).toFixed(1))
          : null

      const {
        salesCycleTotalDays,
        salesCycleCount,
        leadTimeTotalDays,
        leadTimeCount,
        ...rest
      } = closer
      
      return {
        ...rest,
        showRate: closerShowRate,
        closeRate: closerCloseRate,
        averageSalesCycleDays,
        averageLeadTimeDays
      }
    }).sort((a, b) => b.revenue - a.revenue)

    // Group by day of week (using countable appointments)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const byDayOfWeek = Object.values(
      countableAppointments.reduce((acc: DayBreakdownAccumulator, apt) => {
        const day = new Date(apt.scheduledAt).getDay()

        if (!acc[day]) {
          acc[day] = {
            dayOfWeek: day,
            dayName: dayNames[day],
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            cancelled: 0,
            revenue: 0,
            noShows: 0,
            salesCycleTotalDays: 0,
            salesCycleCount: 0,
            leadTimeTotalDays: 0,
            leadTimeCount: 0
          }
        }

        // Store reference to help TypeScript's control flow analysis
        const dayData = acc[day]
        dayData.total++
        dayData.scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          dayData.cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          dayData.showed++
        } else if (apt.status === 'scheduled') {
          // Track no-shows (scheduled but didn't show)
          dayData.noShows++
        }
        if (apt.status === 'signed') {
          dayData.signed++
          dayData.revenue += apt.cashCollected || 0
        }

        const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
        if (salesCycleMeta) {
          dayData.salesCycleTotalDays += salesCycleMeta.days
          dayData.salesCycleCount += 1
        }

        const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
        if (leadTimeMeta) {
          dayData.leadTimeTotalDays += leadTimeMeta.days
          dayData.leadTimeCount += 1
        }

        return acc
      }, {} as DayBreakdownAccumulator)
    ).map((day: DayBreakdownItem) => {
      // Calculate expected calls: scheduled - cancelled
      const dayExpectedCalls = day.scheduled - day.cancelled

      // Show Rate: Percent of expected calls that showed (same as main metric)
      const dayShowRate = dayExpectedCalls > 0
        ? ((day.showed / dayExpectedCalls) * 100).toFixed(1)
        : '0'

      // Close Rate: Percent of qualified calls that closed
      const dayCloseRate = day.showed > 0 ? ((day.signed / day.showed) * 100).toFixed(1) : '0'

      const averageSalesCycleDays =
        day.salesCycleCount > 0
          ? parseFloat((day.salesCycleTotalDays / day.salesCycleCount).toFixed(1))
          : null

      const averageLeadTimeDays =
        day.leadTimeCount > 0
          ? parseFloat((day.leadTimeTotalDays / day.leadTimeCount).toFixed(1))
          : null

      const {
        salesCycleTotalDays,
        salesCycleCount,
        leadTimeTotalDays,
        leadTimeCount,
        ...rest
      } = day

      return {
        ...rest,
        showRate: dayShowRate,
        closeRate: dayCloseRate,
        averageSalesCycleDays,
        averageLeadTimeDays
      }
    }).sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    
    // Group by objection type - using countable appointments
    const byObjection = Object.entries(
      countableAppointments
        .filter(a => a.objectionType && a.status === 'showed')
        .reduce((acc: Record<string, ObjectionData>, apt) => {
          const key = apt.objectionType || 'None'
          if (!acc[key]) {
            acc[key] = { type: key, count: 0, converted: 0, salesCycleTotalDays: 0, salesCycleCount: 0 }
          }
          // Store reference to help TypeScript's control flow analysis
          const objectionData = acc[key]
          objectionData.count++
          if (apt.status === 'signed') objectionData.converted++
          const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
          if (salesCycleMeta) {
            objectionData.salesCycleTotalDays =
              (objectionData.salesCycleTotalDays || 0) + salesCycleMeta.days
            objectionData.salesCycleCount =
              (objectionData.salesCycleCount || 0) + 1
          }
          const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
          if (leadTimeMeta) {
            objectionData.leadTimeTotalDays =
              (objectionData.leadTimeTotalDays || 0) + leadTimeMeta.days
            objectionData.leadTimeCount =
              (objectionData.leadTimeCount || 0) + 1
          }
          return acc
        }, {})
    ).map(([_type, data]: [string, ObjectionData]) => {
      const {
        salesCycleTotalDays = 0,
        salesCycleCount = 0,
        leadTimeTotalDays = 0,
        leadTimeCount = 0,
        ...rest
      } = data
      const averageSalesCycleDays =
        salesCycleCount > 0
          ? parseFloat((salesCycleTotalDays / salesCycleCount).toFixed(1))
          : null
      const averageLeadTimeDays =
        leadTimeCount > 0
          ? parseFloat((leadTimeTotalDays / leadTimeCount).toFixed(1))
          : null

      return {
        ...rest,
        conversionRate: rest.count > 0 ? ((rest.converted / rest.count) * 100).toFixed(1) : 0,
        averageSalesCycleDays,
        averageLeadTimeDays
      }
    }).sort((a, b) => b.count - a.count)
    
    // Group by calendar (traffic source) - using countable appointments
    const byCalendar = Object.entries(
      countableAppointments.reduce((acc: CalendarBreakdownAccumulator, apt) => {
        const key = apt.calendar || 'Unknown'
        if (!acc[key]) {
          acc[key] = {
            calendar: key,
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            cancelled: 0,
            revenue: 0,
            salesCycleTotalDays: 0,
            salesCycleCount: 0,
            leadTimeTotalDays: 0,
            leadTimeCount: 0
          }
        }

        // Store reference to help TypeScript's control flow analysis
        const calendarData = acc[key]
        calendarData.total++
        calendarData.scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          calendarData.cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          calendarData.showed++
        }
        if (apt.status === 'signed') {
          calendarData.signed++
          calendarData.revenue += apt.cashCollected || 0
        }

        const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
        if (salesCycleMeta) {
          calendarData.salesCycleTotalDays += salesCycleMeta.days
          calendarData.salesCycleCount += 1
        }

        const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
        if (leadTimeMeta) {
          calendarData.leadTimeTotalDays += leadTimeMeta.days
          calendarData.leadTimeCount += 1
        }

        return acc
      }, {} as CalendarBreakdownAccumulator)
    ).map(([_calendar, data]: [string, CalendarBreakdownItem]) => {
      // Calculate expected calls: scheduled - cancelled
      const calendarExpectedCalls = data.scheduled - data.cancelled

      // Show Rate: Percent of expected calls that showed (same as main metric)
      const calendarShowRate = calendarExpectedCalls > 0
        ? ((data.showed / calendarExpectedCalls) * 100).toFixed(1)
        : '0'

      // Close Rate: Percent of qualified calls that closed
      const calendarCloseRate = data.showed > 0 ? ((data.signed / data.showed) * 100).toFixed(1) : '0'

      const averageSalesCycleDays =
        data.salesCycleCount > 0
          ? parseFloat((data.salesCycleTotalDays / data.salesCycleCount).toFixed(1))
          : null
      const averageLeadTimeDays =
        data.leadTimeCount > 0
          ? parseFloat((data.leadTimeTotalDays / data.leadTimeCount).toFixed(1))
          : null

      const {
        salesCycleTotalDays,
        salesCycleCount,
        leadTimeTotalDays,
        leadTimeCount,
        ...rest
      } = data

      return {
        ...rest,
        showRate: calendarShowRate,
        closeRate: calendarCloseRate,
        averageSalesCycleDays,
        averageLeadTimeDays
      }
    }).sort((a, b) => b.revenue - a.revenue)
    
    // Group by appointment type (first call vs follow up) - using countable appointments
    const byAppointmentType = [
      {
        type: 'First Call',
        ...countableAppointments
          .filter(a => a.isFirstCall)
          .reduce((acc, apt) => {
            acc.total++
            acc.scheduled++ // All appointments in countableAppointments are scheduled
            if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
              acc.cancelled++
            }
            if (apt.status === 'showed' || apt.status === 'signed') {
              acc.showed++
            }
            if (apt.status === 'signed') {
              acc.signed++
              acc.revenue += apt.cashCollected || 0
            }
            const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
            if (salesCycleMeta) {
              acc.salesCycleTotalDays += salesCycleMeta.days
              acc.salesCycleCount += 1
            }
            const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
            if (leadTimeMeta) {
              acc.leadTimeTotalDays += leadTimeMeta.days
              acc.leadTimeCount += 1
            }
            return acc
          }, { total: 0, scheduled: 0, cancelled: 0, showed: 0, signed: 0, revenue: 0, salesCycleTotalDays: 0, salesCycleCount: 0, leadTimeTotalDays: 0, leadTimeCount: 0 })
      },
      {
        type: 'Follow Up',
        ...countableAppointments
          .filter(a => !a.isFirstCall)
          .reduce((acc, apt) => {
            acc.total++
            acc.scheduled++ // All appointments in countableAppointments are scheduled
            if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
              acc.cancelled++
            }
            if (apt.status === 'showed' || apt.status === 'signed') {
              acc.showed++
            }
            if (apt.status === 'signed') {
              acc.signed++
              acc.revenue += apt.cashCollected || 0
            }
            const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
            if (salesCycleMeta) {
              acc.salesCycleTotalDays += salesCycleMeta.days
              acc.salesCycleCount += 1
            }
            const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
            if (leadTimeMeta) {
              acc.leadTimeTotalDays += leadTimeMeta.days
              acc.leadTimeCount += 1
            }
            return acc
          }, { total: 0, scheduled: 0, cancelled: 0, showed: 0, signed: 0, revenue: 0, salesCycleTotalDays: 0, salesCycleCount: 0, leadTimeTotalDays: 0, leadTimeCount: 0 })
      }
    ].map(type => {
      // Calculate expected calls: scheduled - cancelled
      const typeExpectedCalls = type.scheduled - type.cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const typeShowRate = typeExpectedCalls > 0
        ? ((type.showed / typeExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed
      const typeCloseRate = type.showed > 0 ? ((type.signed / type.showed) * 100).toFixed(1) : '0'
      
      const averageSalesCycleDays =
        type.salesCycleCount > 0
          ? parseFloat((type.salesCycleTotalDays / type.salesCycleCount).toFixed(1))
          : null

      const averageLeadTimeDays =
        type.leadTimeCount > 0
          ? parseFloat((type.leadTimeTotalDays / type.leadTimeCount).toFixed(1))
          : null

      const {
        salesCycleTotalDays,
        salesCycleCount,
        leadTimeTotalDays,
        leadTimeCount,
        ...rest
      } = type

      return {
        ...rest,
        showRate: typeShowRate,
        closeRate: typeCloseRate,
        averageSalesCycleDays,
        averageLeadTimeDays
      }
    })
    
    // Time of day analysis - using countable appointments
    const byTimeOfDay = ['morning', 'afternoon', 'evening', 'night'].map(period => {
      const periodAppointments = countableAppointments.filter(apt => {
        // Use startTime if available, otherwise fall back to scheduledAt
        const timeToCheck = apt.startTime || apt.scheduledAt
        const hour = new Date(timeToCheck).getHours()
        switch(period) {
          case 'morning': return hour >= 6 && hour < 12
          case 'afternoon': return hour >= 12 && hour < 17
          case 'evening': return hour >= 17 && hour < 21
          case 'night': return hour >= 21 || hour < 6
          default: return false
        }
      })
      
      const scheduled = periodAppointments.length // All appointments in countableAppointments are scheduled
      const cancelled = periodAppointments.filter(a => 
        a.status === 'cancelled' || 
        a.outcome === 'Cancelled' || 
        a.outcome === 'cancelled'
      ).length
      const showed = periodAppointments.filter(a => a.status === 'showed' || a.status === 'signed').length
      const signed = periodAppointments.filter(a => a.status === 'signed').length
      const salesCycleStats = periodAppointments.reduce(
        (acc, apt) => {
          const meta = appointmentSalesCycleMeta.get(apt.id)
          if (meta) {
            acc.totalDays += meta.days
            acc.count += 1
          }
          return acc
        },
        { totalDays: 0, count: 0 }
      )

      const leadTimeStats = periodAppointments.reduce(
        (acc, apt) => {
          const meta = appointmentLeadTimeMeta.get(apt.id)
          if (meta) {
            acc.totalDays += meta.days
            acc.count += 1
          }
          return acc
        },
        { totalDays: 0, count: 0 }
      )
      
      // Calculate expected calls: scheduled - cancelled
      const periodExpectedCalls = scheduled - cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const periodShowRate = periodExpectedCalls > 0
        ? ((showed / periodExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed
      const periodCloseRate = showed > 0 ? ((signed / showed) * 100).toFixed(1) : '0'
      
      const averageSalesCycleDays =
        salesCycleStats.count > 0
          ? parseFloat((salesCycleStats.totalDays / salesCycleStats.count).toFixed(1))
          : null

      const averageLeadTimeDays =
        leadTimeStats.count > 0
          ? parseFloat((leadTimeStats.totalDays / leadTimeStats.count).toFixed(1))
          : null

      return {
        period: period.charAt(0).toUpperCase() + period.slice(1),
        total: periodAppointments.length,
        scheduled,
        showed,
        signed,
        showRate: periodShowRate,
        closeRate: periodCloseRate,
        averageSalesCycleDays,
        averageLeadTimeDays
      }
    })
    
    // Group by traffic source - using countable appointments
    const byTrafficSource = Object.values(
      countableAppointments.reduce((acc: SourceBreakdownAccumulator, apt) => {
        const key = apt.attributionSource || 'Unknown'
        if (!acc[key]) {
          acc[key] = {
            source: key,
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            cancelled: 0,
            revenue: 0,
            salesCycleTotalDays: 0,
            salesCycleCount: 0,
            leadTimeTotalDays: 0,
            leadTimeCount: 0
          }
        }

        // Store reference to help TypeScript's control flow analysis
        const sourceData = acc[key]
        sourceData.total++
        sourceData.scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          sourceData.cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          sourceData.showed++
        }
        if (apt.status === 'signed') {
          sourceData.signed++
          sourceData.revenue += apt.cashCollected || 0
        }

        const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
        if (salesCycleMeta) {
          sourceData.salesCycleTotalDays += salesCycleMeta.days
          sourceData.salesCycleCount += 1
        }

        const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
        if (leadTimeMeta) {
          sourceData.leadTimeTotalDays += leadTimeMeta.days
          sourceData.leadTimeCount += 1
        }

        return acc
      }, {} as SourceBreakdownAccumulator)
    ).map((source: SourceBreakdownItem) => {
      // Calculate expected calls: scheduled - cancelled
      const sourceExpectedCalls = source.scheduled - source.cancelled

      // Show Rate: Percent of expected calls that showed (same as main metric)
      const sourceShowRate = sourceExpectedCalls > 0
        ? ((source.showed / sourceExpectedCalls) * 100).toFixed(1)
        : '0'

      // Close Rate: Percent of qualified calls that closed
      const sourceCloseRate = source.showed > 0 ? ((source.signed / source.showed) * 100).toFixed(1) : '0'

      const averageSalesCycleDays =
        source.salesCycleCount > 0
          ? parseFloat((source.salesCycleTotalDays / source.salesCycleCount).toFixed(1))
          : null
      const averageLeadTimeDays =
        source.leadTimeCount > 0
          ? parseFloat((source.leadTimeTotalDays / source.leadTimeCount).toFixed(1))
          : null

      const {
        salesCycleTotalDays,
        salesCycleCount,
        leadTimeTotalDays,
        leadTimeCount,
        ...rest
      } = source

      return {
        ...rest,
        showRate: sourceShowRate,
        closeRate: sourceCloseRate,
        averageSalesCycleDays,
        averageLeadTimeDays
      }
    }).sort((a, b) => b.revenue - a.revenue)
    
    const mapAppointmentDetail = (apt: AppointmentWithRelations) => {
      const salesCycleMeta = appointmentSalesCycleMeta.get(apt.id)
      const leadTimeMeta = appointmentLeadTimeMeta.get(apt.id)
      return {
        id: apt.id,
        scheduledAt: apt.scheduledAt.toISOString(),
        startTime: apt.startTime ? apt.startTime.toISOString() : null,
        createdAt: apt.createdAt?.toISOString() || null,
        contactName: apt.contact?.name || 'Unknown contact',
        closerId: apt.closerId,
        closerName: apt.closer?.name || 'Unassigned',
        status: apt.status,
        outcome: apt.outcome,
        cashCollected:
          apt.cashCollected !== null && apt.cashCollected !== undefined
            ? Number(apt.cashCollected)
            : null,
        pcnSubmittedAt: apt.pcnSubmittedAt?.toISOString() || null,
        notes: apt.notes || null,
        salesCycleDays: salesCycleMeta
          ? parseFloat(salesCycleMeta.days.toFixed(1))
          : null,
        firstCallAt: salesCycleMeta ? salesCycleMeta.firstCallAt.toISOString() : null,
        closedAt: salesCycleMeta ? salesCycleMeta.closedAt.toISOString() : null,
        appointmentLeadTimeDays: leadTimeMeta
          ? parseFloat(leadTimeMeta.days.toFixed(1))
          : null
      }
    }

    let detail: any = null

    if (detailMetric) {
      const normalizedMetric = detailMetric.toLowerCase()
    const appointmentDetailMap = new Map<string, ReturnType<typeof mapAppointmentDetail>>()
    countableAppointments.forEach((apt) => {
      appointmentDetailMap.set(apt.id, mapAppointmentDetail(apt))
    })
    callsCreatedAppointments.forEach((apt) => {
      appointmentDetailMap.set(apt.id, mapAppointmentDetail(apt))
    })
      switch (normalizedMetric) {
        case 'callscreated': {
          detail = {
            metric: 'callsCreated',
            items: callsCreatedAppointments.map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment'
            }))
          }
          break
        }
        case 'scheduledcallstodate': {
          detail = {
            metric: 'scheduledCallsToDate',
            items: countableAppointments.map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment'
            }))
          }
          break
        }
        case 'qualifiedcalls': {
          const qualifiedAppointments = countableAppointments.filter(
            (apt) => apt.wasOfferMade === true
          )
          detail = {
            metric: 'qualifiedCalls',
            items: qualifiedAppointments.map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment'
            }))
          }
          break
        }
        case 'callsshowed': {
          const showedAppointments = countableAppointments.filter(
            (apt) => apt.status === 'showed' || apt.status === 'signed'
          )
          detail = {
            metric: 'callsShown',
            items: showedAppointments.map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment'
            }))
          }
          break
        }
        case 'totalunitsclosed': {
          const signedAppointments = countableAppointments.filter(
            (apt) => apt.status === 'signed'
          )
          const appointmentItems = signedAppointments.map((apt) => ({
            ...mapAppointmentDetail(apt),
            type: 'appointment',
            source: 'appointment',
            amount:
              apt.cashCollected !== null && apt.cashCollected !== undefined
                ? Number(apt.cashCollected)
                : null
          }))

          const saleItems = filteredSales.map((sale) => {
            const related = sale.appointmentId ? appointmentDetailMap.get(sale.appointmentId) : null
            return {
              type: 'sale',
              source: 'sale',
              saleId: sale.id,
              appointmentId: sale.appointmentId,
              contactName: related?.contactName || 'Unknown contact',
              closerId: related?.closerId || null,
              closerName: related?.closerName || 'Unassigned',
              scheduledAt: related?.scheduledAt || null,
              paidAt: sale.paidAt ? sale.paidAt.toISOString() : null,
              amount: Number(sale.amount)
            }
          })

          detail = {
            metric: 'totalUnitsClosed',
            items: [...appointmentItems, ...saleItems]
          }
          break
        }
        case 'cashcollected': {
          const appointmentItems = countableAppointments
            .filter((apt) => apt.cashCollected && apt.cashCollected > 0)
            .map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment',
              source: 'appointment',
              amount: Number(apt.cashCollected)
            }))

          const saleItems = filteredSales.map((sale) => {
            const related = sale.appointmentId ? appointmentDetailMap.get(sale.appointmentId) : null
            return {
              type: 'sale',
              source: 'sale',
              saleId: sale.id,
              appointmentId: sale.appointmentId,
              contactName: related?.contactName || 'Unknown contact',
              closerId: related?.closerId || null,
              closerName: related?.closerName || 'Unassigned',
              scheduledAt: related?.scheduledAt || null,
              paidAt: sale.paidAt ? sale.paidAt.toISOString() : null,
              amount: Number(sale.amount)
            }
          })

          detail = {
            metric: 'cashCollected',
            items: [...appointmentItems, ...saleItems]
          }
          break
        }
        case 'missingpcns': {
          detail = {
            metric: 'missingPCNs',
            items: overduePCNAppointments.map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment',
              minutesSinceScheduled: Math.floor(
                (Date.now() - new Date(apt.scheduledAt).getTime()) / (1000 * 60)
              )
            }))
          }
          break
        }
        case 'salescycle': {
          const cycleAppointments = countableAppointments.filter((apt) =>
            appointmentSalesCycleMeta.has(apt.id)
          )
          detail = {
            metric: 'salesCycle',
            items: cycleAppointments.map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment'
            }))
          }
          break
        }
        case 'appointmentleadtime': {
          const leadTimeAppointments = countableAppointments.filter((apt) =>
            appointmentLeadTimeMeta.has(apt.id)
          )
          detail = {
            metric: 'appointmentLeadTime',
            items: leadTimeAppointments.map((apt) => ({
              ...mapAppointmentDetail(apt),
              type: 'appointment'
            }))
          }
          break
        }
        default: {
          detail = {
            metric: detailMetricRaw,
            items: []
          }
        }
      }
    }

    return NextResponse.json({
      // New metrics
      callsCreated,
      scheduledCallsToDate,
      cancellationRate: parseFloat(cancellationRate),
      noShowRate: parseFloat(noShowRate),
      showRate: parseFloat(showRate),
      callsShown,
      qualifiedCalls,
      qualifiedRate: parseFloat(qualifiedRate),
      totalUnitsClosed,
      closeRate: parseFloat(closeRate),
      scheduledCallsToClosed: parseFloat(scheduledCallsToClosed),
      dollarsOverScheduledCallsToDate: parseFloat(dollarsOverScheduledCallsToDate),
      dollarsOverShow: parseFloat(dollarsOverShow),
      cashCollected,
      missingPCNs,
      timezone: companyTimezone,
      averageSalesCycleDays,
      salesCycleCount,
      averageAppointmentLeadTimeDays: averageLeadTimeDays,
      appointmentLeadTimeCount: leadTimeCount,
      
      // Legacy metrics (for backward compatibility)
      totalAppointments,
      scheduled,
      showed,
      signed,
      noShows,
      totalRevenue,
      avgDealSize: parseFloat(avgDealSize),
      scheduledCallCloseRate: parseFloat(scheduledCallCloseRate),
      revenuePerScheduledCall: parseFloat(revenuePerScheduledCall),
      revenuePerShowedCall: parseFloat(revenuePerShowedCall),
      
      // Breakdowns
      byCloser,
      byDayOfWeek,
      byObjection,
      byCalendar,
      byAppointmentType,
      byTimeOfDay,
      byTrafficSource,
      ...(detail ? { detail } : {})
    })
    
  } catch (error) {
    console.error('Analytics error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}


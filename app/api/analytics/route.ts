import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser, canViewAllData } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const searchParams = request.nextUrl.searchParams
    
    // Get the effective company ID (respects viewAs for super admins)
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)
    
    // Store date range for Calls Created calculation (uses createdAt)
    const dateFrom = searchParams.get('dateFrom') ? new Date(searchParams.get('dateFrom')!) : null
    const dateTo = searchParams.get('dateTo') ? new Date(searchParams.get('dateTo')!) : null
    
    // Build where clause based on filters
    // Note: Date filters apply to scheduledAt for "Scheduled Calls to Date"
    // "Calls Created" will be calculated separately using createdAt
    const where: any = {
      companyId: effectiveCompanyId
    }
    
    // If not admin, only show their appointments
    if (!canViewAllData(user)) {
      where.closerId = user.id
    }
    
    // Date filters for scheduledAt (for "Scheduled Calls to Date")
    if (dateFrom || dateTo) {
      where.scheduledAt = {}
      if (dateFrom) {
        where.scheduledAt.gte = dateFrom
      }
      if (dateTo) {
        where.scheduledAt.lte = dateTo
      }
    }
    
    // Status filter
    if (searchParams.get('status')) {
      where.status = searchParams.get('status')
    }
    
    // Closer filter
    if (searchParams.get('closer')) {
      where.closerId = searchParams.get('closer')
    }
    
    // Objection type filter
    if (searchParams.get('objectionType')) {
      where.objectionType = {
        contains: searchParams.get('objectionType'),
        mode: 'insensitive'
      }
    }
    
    // Appointment type filter (first call vs follow up)
    if (searchParams.get('appointmentType')) {
      where.isFirstCall = searchParams.get('appointmentType') === 'first_call'
    }
    
    // Follow-up needed filter
    if (searchParams.get('followUpNeeded') === 'true') {
      where.followUpScheduled = true
      where.status = { notIn: ['signed', 'cancelled'] }
    }
    
    // Nurture type filter
    if (searchParams.get('nurtureType')) {
      where.nurtureType = {
        contains: searchParams.get('nurtureType'),
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
    if (searchParams.get('calendar')) {
      where.calendar = {
        contains: searchParams.get('calendar'),
        mode: 'insensitive'
      }
    }
    
    // Traffic source filter
    if (searchParams.get('trafficSource')) {
      where.attributionSource = {
        contains: searchParams.get('trafficSource'),
        mode: 'insensitive'
      }
    }
    
    // Get all appointments matching filters (including those with null flag for backwards compatibility)
    const appointments = await withPrisma(async (prisma) => {
      return await prisma.appointment.findMany({
        where: {
          ...where,
          // Only include appointments that should be counted (flag = 1 or null for backwards compatibility)
          // Exclude appointments with flag = 0 (superseded)
          OR: [
            { appointmentInclusionFlag: 1 },
            { appointmentInclusionFlag: null }
          ]
        },
        include: {
          closer: true,
          contact: true,
        },
        orderBy: {
          scheduledAt: 'desc'
        }
      })
    })
    
    // Apply day of week filter if provided (post-query filter)
    let filteredAppointments = appointments
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
    const countableAppointments = filteredAppointments.filter((a: any) => 
      (a.appointmentInclusionFlag === 1 || a.appointmentInclusionFlag === null) &&
      (a.appointmentInclusionFlag !== 0)
    )
    
    // Calls Created: Number of calls with a Create Date inside the selected time frame
    // This requires a separate query using createdAt instead of scheduledAt
    // Apply all the same filters except date (which uses createdAt)
    let callsCreated = 0
    const createdWhereClause: any = {
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
    if (dateFrom || dateTo) {
      createdWhereClause.createdAt = {}
      if (dateFrom) {
        createdWhereClause.createdAt.gte = dateFrom
      }
      if (dateTo) {
        createdWhereClause.createdAt.lte = dateTo
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
        where: createdWhereClause
      })
    })
    
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
    const isPCNOverdue = (appointment: any): boolean => {
      // Exclude if PCN already submitted
      if (appointment.pcnSubmitted) return false
      
      // Exclude cancelled appointments (check both status and outcome)
      if (appointment.status === 'cancelled' || 
          appointment.outcome === 'Cancelled' || 
          appointment.outcome === 'cancelled') return false
      
      // Exclude appointments with flag = 0 (superseded by another appointment)
      // Only count appointments that should be included (flag = 1 or null for backwards compatibility)
      if (appointment.appointmentInclusionFlag === 0) return false
      
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
    
    const missingPCNs = filteredAppointments.filter(isPCNOverdue).length
    
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
          amount: true,
          appointmentId: true,
          paidAt: true
        }
      })
    })
    
    // Filter sales by date range if provided
    let filteredSales = matchedSales
    if (dateFrom || dateTo) {
      filteredSales = matchedSales.filter(sale => {
        if (!sale.paidAt) return false
        const paidDate = new Date(sale.paidAt)
        if (dateFrom && paidDate < dateFrom) return false
        if (dateTo && paidDate > dateTo) return false
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
      countableAppointments.reduce((acc: any, apt) => {
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
            revenue: 0
          }
        }
        
        acc[key].total++
        acc[key].scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          acc[key].cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          acc[key].showed++
        }
        if (apt.status === 'signed') {
          acc[key].signed++
          acc[key].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map((closer: any) => {
      // Calculate expected calls: scheduled - cancelled
      const closerExpectedCalls = closer.scheduled - closer.cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const closerShowRate = closerExpectedCalls > 0
        ? ((closer.showed / closerExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed (legacy calculation for backward compatibility)
      const closerCloseRate = closer.showed > 0 ? ((closer.signed / closer.showed) * 100).toFixed(1) : '0'
      
      return {
        ...closer,
        showRate: closerShowRate,
        closeRate: closerCloseRate
      }
    }).sort((a: any, b: any) => b.revenue - a.revenue)
    
    // Group by day of week (using countable appointments)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const byDayOfWeek = Object.values(
      countableAppointments.reduce((acc: any, apt) => {
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
            revenue: 0
          }
        }
        
        acc[day].total++
        acc[day].scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          acc[day].cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          acc[day].showed++
        }
        if (apt.status === 'signed') {
          acc[day].signed++
          acc[day].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map((day: any) => {
      // Calculate expected calls: scheduled - cancelled
      const dayExpectedCalls = day.scheduled - day.cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const dayShowRate = dayExpectedCalls > 0
        ? ((day.showed / dayExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed
      const dayCloseRate = day.showed > 0 ? ((day.signed / day.showed) * 100).toFixed(1) : '0'
      
      return {
        ...day,
        showRate: dayShowRate,
        closeRate: dayCloseRate
      }
    }).sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek)
    
    // Group by objection type - using countable appointments
    const byObjection = Object.entries(
      countableAppointments
        .filter(a => a.objectionType && a.status === 'showed')
        .reduce((acc: any, apt) => {
          const key = apt.objectionType || 'None'
          if (!acc[key]) {
            acc[key] = { type: key, count: 0, converted: 0 }
          }
          acc[key].count++
          if (apt.status === 'signed') acc[key].converted++
          return acc
        }, {})
    ).map(([type, data]: [string, any]) => ({
      ...data,
      conversionRate: data.count > 0 ? ((data.converted / data.count) * 100).toFixed(1) : 0
    })).sort((a: any, b: any) => b.count - a.count)
    
    // Group by calendar (traffic source) - using countable appointments
    const byCalendar = Object.entries(
      countableAppointments.reduce((acc: any, apt) => {
        const key = apt.calendar || 'Unknown'
        if (!acc[key]) {
          acc[key] = {
            calendar: key,
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            cancelled: 0,
            revenue: 0
          }
        }
        
        acc[key].total++
        acc[key].scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          acc[key].cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          acc[key].showed++
        }
        if (apt.status === 'signed') {
          acc[key].signed++
          acc[key].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map(([calendar, data]: [string, any]) => {
      // Calculate expected calls: scheduled - cancelled
      const calendarExpectedCalls = data.scheduled - data.cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const calendarShowRate = calendarExpectedCalls > 0
        ? ((data.showed / calendarExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed
      const calendarCloseRate = data.showed > 0 ? ((data.signed / data.showed) * 100).toFixed(1) : '0'
      
      return {
        ...data,
        showRate: calendarShowRate,
        closeRate: calendarCloseRate
      }
    }).sort((a: any, b: any) => b.revenue - a.revenue)
    
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
            return acc
          }, { total: 0, scheduled: 0, cancelled: 0, showed: 0, signed: 0, revenue: 0 })
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
            return acc
          }, { total: 0, scheduled: 0, cancelled: 0, showed: 0, signed: 0, revenue: 0 })
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
      
      return {
        ...type,
        showRate: typeShowRate,
        closeRate: typeCloseRate
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
      
      // Calculate expected calls: scheduled - cancelled
      const periodExpectedCalls = scheduled - cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const periodShowRate = periodExpectedCalls > 0
        ? ((showed / periodExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed
      const periodCloseRate = showed > 0 ? ((signed / showed) * 100).toFixed(1) : '0'
      
      return {
        period: period.charAt(0).toUpperCase() + period.slice(1),
        total: periodAppointments.length,
        scheduled,
        showed,
        signed,
        showRate: periodShowRate,
        closeRate: periodCloseRate
      }
    })
    
    // Group by traffic source - using countable appointments
    const byTrafficSource = Object.values(
      countableAppointments.reduce((acc: any, apt) => {
        const key = apt.attributionSource || 'Unknown'
        if (!acc[key]) {
          acc[key] = {
            trafficSource: key,
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            cancelled: 0,
            revenue: 0
          }
        }
        
        acc[key].total++
        acc[key].scheduled++ // All appointments in countableAppointments are scheduled
        if (apt.status === 'cancelled' || apt.outcome === 'Cancelled' || apt.outcome === 'cancelled') {
          acc[key].cancelled++
        }
        if (apt.status === 'showed' || apt.status === 'signed') {
          acc[key].showed++
        }
        if (apt.status === 'signed') {
          acc[key].signed++
          acc[key].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map((source: any) => {
      // Calculate expected calls: scheduled - cancelled
      const sourceExpectedCalls = source.scheduled - source.cancelled
      
      // Show Rate: Percent of expected calls that showed (same as main metric)
      const sourceShowRate = sourceExpectedCalls > 0
        ? ((source.showed / sourceExpectedCalls) * 100).toFixed(1)
        : '0'
      
      // Close Rate: Percent of qualified calls that closed
      const sourceCloseRate = source.showed > 0 ? ((source.signed / source.showed) * 100).toFixed(1) : '0'
      
      return {
        ...source,
        showRate: sourceShowRate,
        closeRate: sourceCloseRate
      }
    }).sort((a: any, b: any) => b.revenue - a.revenue)
    
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
      byTrafficSource
    })
    
  } catch (error: any) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

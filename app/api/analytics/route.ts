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
    
    // Build where clause based on filters
    const where: any = {
      companyId: effectiveCompanyId
    }
    
    // If not admin, only show their appointments
    if (!canViewAllData(user)) {
      where.closerId = user.id
    }
    
    // Date filters
    if (searchParams.get('dateFrom') || searchParams.get('dateTo')) {
      where.scheduledAt = {}
      if (searchParams.get('dateFrom')) {
        where.scheduledAt.gte = new Date(searchParams.get('dateFrom')!)
      }
      if (searchParams.get('dateTo')) {
        where.scheduledAt.lte = new Date(searchParams.get('dateTo')!)
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
    
    // Get all appointments matching filters
    const appointments = await withPrisma(async (prisma) => {
      return await prisma.appointment.findMany({
        where,
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
    
    // Calculate metrics
    const totalAppointments = filteredAppointments.length
    const scheduled = filteredAppointments.filter(a => a.status !== 'cancelled').length
    const showed = filteredAppointments.filter(a => a.status === 'showed' || a.status === 'signed').length
    const signed = filteredAppointments.filter(a => a.status === 'signed').length
    const noShows = filteredAppointments.filter(a => a.status === 'no_show').length
    
    // Calculate missing PCNs (overdue if not submitted by 6PM Eastern on appointment day)
    const isPCNOverdue = (appointment: any): boolean => {
      if (appointment.pcnSubmitted || appointment.status === 'cancelled') return false
      
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
    
    // Show Rate calculation: Excel uses Shown / (Scheduled - Missing PCNs)
    // This represents the percentage of processed appointments that showed up
    const scheduledMinusMissingPCNs = scheduled - missingPCNs
    const showRate = scheduledMinusMissingPCNs > 0 
      ? ((showed / scheduledMinusMissingPCNs) * 100).toFixed(1) 
      : (scheduled > 0 ? ((showed / scheduled) * 100).toFixed(1) : '0')
    
    // Close Rate: Excel uses Closed / Shown
    const closeRate = showed > 0 ? ((signed / showed) * 100).toFixed(1) : '0'
    
    // Calculate revenue from appointments and matched sales
    const revenueFromAppointments = filteredAppointments
      .reduce((sum, apt) => sum + (apt.cashCollected || 0), 0)
    
    // Get matched sales for appointments in this date range
    const appointmentIds = filteredAppointments.map(a => a.id)
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
          appointmentId: true
        }
      })
    })
    
    const revenueFromSales = matchedSales.reduce((sum, sale) => {
      return sum + Number(sale.amount)
    }, 0)
    
    const totalRevenue = revenueFromAppointments + revenueFromSales
    
    const avgDealSize = signed > 0 
      ? (totalRevenue / signed).toFixed(0)
      : '0'
    
    // Calculate closed deals (signed appointments OR appointments with matched sales)
    const closedDeals = new Set([
      ...filteredAppointments.filter(a => a.status === 'signed').map(a => a.id),
      ...matchedSales.map(s => s.appointmentId).filter(Boolean)
    ]).size
    
    // Calculate scheduled call/close %
    const scheduledCallCloseRate = scheduled > 0 
      ? ((closedDeals / scheduled) * 100).toFixed(1)
      : '0'
    
    // Revenue per scheduled call
    const revenuePerScheduledCall = scheduled > 0
      ? (totalRevenue / scheduled).toFixed(2)
      : '0'
    
    // Revenue per showed call
    const revenuePerShowedCall = showed > 0
      ? (totalRevenue / showed).toFixed(2)
      : '0'
    
    
    // Group by closer
    const byCloser = Object.values(
      filteredAppointments.reduce((acc: any, apt) => {
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
            revenue: 0
          }
        }
        
        acc[key].total++
        if (apt.status !== 'cancelled') acc[key].scheduled++
        if (apt.status === 'showed' || apt.status === 'signed') acc[key].showed++
        if (apt.status === 'signed') {
          acc[key].signed++
          acc[key].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map((closer: any) => {
      // Calculate missing PCNs for this closer's appointments
      const closerAppointments = filteredAppointments.filter(a => 
        a.closer && a.closer.email === closer.closerEmail
      )
      const closerMissingPCNs = closerAppointments.filter(isPCNOverdue).length
      
      // Show Rate: Excel uses Shown / (Scheduled - Missing PCNs)
      const closerScheduledMinusMissing = closer.scheduled - closerMissingPCNs
      const closerShowRate = closerScheduledMinusMissing > 0
        ? ((closer.showed / closerScheduledMinusMissing) * 100).toFixed(1)
        : (closer.scheduled > 0 ? ((closer.showed / closer.scheduled) * 100).toFixed(1) : '0')
      
      // Close Rate: Excel uses Closed / Shown
      const closerCloseRate = closer.showed > 0 ? ((closer.signed / closer.showed) * 100).toFixed(1) : '0'
      
      return {
        ...closer,
        showRate: closerShowRate,
        closeRate: closerCloseRate
      }
    }).sort((a: any, b: any) => b.revenue - a.revenue)
    
    // Group by day of week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const byDayOfWeek = Object.values(
      filteredAppointments.reduce((acc: any, apt) => {
        const day = new Date(apt.scheduledAt).getDay()
        
        if (!acc[day]) {
          acc[day] = {
            dayOfWeek: day,
            dayName: dayNames[day],
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            revenue: 0
          }
        }
        
        acc[day].total++
        if (apt.status !== 'cancelled') acc[day].scheduled++
        if (apt.status === 'showed' || apt.status === 'signed') acc[day].showed++
        if (apt.status === 'signed') {
          acc[day].signed++
          acc[day].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map((day: any) => {
      // Calculate missing PCNs for this day's appointments
      const dayAppointments = filteredAppointments.filter(a => {
        const aptDay = new Date(a.scheduledAt).getDay()
        return aptDay === day.dayOfWeek
      })
      const dayMissingPCNs = dayAppointments.filter(isPCNOverdue).length
      
      // Show Rate: Excel uses Shown / (Scheduled - Missing PCNs)
      const dayScheduledMinusMissing = day.scheduled - dayMissingPCNs
      const dayShowRate = dayScheduledMinusMissing > 0
        ? ((day.showed / dayScheduledMinusMissing) * 100).toFixed(1)
        : (day.scheduled > 0 ? ((day.showed / day.scheduled) * 100).toFixed(1) : '0')
      
      // Close Rate: Excel uses Closed / Shown
      const dayCloseRate = day.showed > 0 ? ((day.signed / day.showed) * 100).toFixed(1) : '0'
      
      return {
        ...day,
        showRate: dayShowRate,
        closeRate: dayCloseRate
      }
    }).sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek)
    
    // Group by objection type
    const byObjection = Object.entries(
      filteredAppointments
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
    
    // Group by calendar (traffic source)
    const byCalendar = Object.entries(
      filteredAppointments.reduce((acc: any, apt) => {
        const key = apt.calendar || 'Unknown'
        if (!acc[key]) {
          acc[key] = {
            calendar: key,
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            revenue: 0
          }
        }
        
        acc[key].total++
        if (apt.status !== 'cancelled') acc[key].scheduled++
        if (apt.status === 'showed' || apt.status === 'signed') acc[key].showed++
        if (apt.status === 'signed') {
          acc[key].signed++
          acc[key].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map(([calendar, data]: [string, any]) => {
      // Calculate missing PCNs for this calendar's appointments
      const calendarAppointments = filteredAppointments.filter(a => 
        (a.calendar || 'Unknown') === calendar
      )
      const calendarMissingPCNs = calendarAppointments.filter(isPCNOverdue).length
      
      // Show Rate: Excel uses Shown / (Scheduled - Missing PCNs)
      const calendarScheduledMinusMissing = data.scheduled - calendarMissingPCNs
      const calendarShowRate = calendarScheduledMinusMissing > 0
        ? ((data.showed / calendarScheduledMinusMissing) * 100).toFixed(1)
        : (data.scheduled > 0 ? ((data.showed / data.scheduled) * 100).toFixed(1) : '0')
      
      // Close Rate: Excel uses Closed / Shown
      const calendarCloseRate = data.showed > 0 ? ((data.signed / data.showed) * 100).toFixed(1) : '0'
      
      return {
        ...data,
        showRate: calendarShowRate,
        closeRate: calendarCloseRate
      }
    }).sort((a: any, b: any) => b.revenue - a.revenue)
    
    // Group by appointment type (first call vs follow up)
    const byAppointmentType = [
      {
        type: 'First Call',
        ...filteredAppointments
          .filter(a => a.isFirstCall)
          .reduce((acc, apt) => {
            acc.total++
            if (apt.status !== 'cancelled') acc.scheduled++
            if (apt.status === 'showed' || apt.status === 'signed') acc.showed++
            if (apt.status === 'signed') {
              acc.signed++
              acc.revenue += apt.cashCollected || 0
            }
            return acc
          }, { total: 0, scheduled: 0, showed: 0, signed: 0, revenue: 0 })
      },
      {
        type: 'Follow Up',
        ...filteredAppointments
          .filter(a => !a.isFirstCall)
          .reduce((acc, apt) => {
            acc.total++
            if (apt.status !== 'cancelled') acc.scheduled++
            if (apt.status === 'showed' || apt.status === 'signed') acc.showed++
            if (apt.status === 'signed') {
              acc.signed++
              acc.revenue += apt.cashCollected || 0
            }
            return acc
          }, { total: 0, scheduled: 0, showed: 0, signed: 0, revenue: 0 })
      }
    ].map(type => {
      // Calculate missing PCNs for this appointment type
      const typeAppointments = filteredAppointments.filter(a => 
        type.type === 'First Call' ? a.isFirstCall : !a.isFirstCall
      )
      const typeMissingPCNs = typeAppointments.filter(isPCNOverdue).length
      
      // Show Rate: Excel uses Shown / (Scheduled - Missing PCNs)
      const typeScheduledMinusMissing = type.scheduled - typeMissingPCNs
      const typeShowRate = typeScheduledMinusMissing > 0
        ? ((type.showed / typeScheduledMinusMissing) * 100).toFixed(1)
        : (type.scheduled > 0 ? ((type.showed / type.scheduled) * 100).toFixed(1) : '0')
      
      // Close Rate: Excel uses Closed / Shown
      const typeCloseRate = type.showed > 0 ? ((type.signed / type.showed) * 100).toFixed(1) : '0'
      
      return {
        ...type,
        showRate: typeShowRate,
        closeRate: typeCloseRate
      }
    })
    
    // Time of day analysis
    const byTimeOfDay = ['morning', 'afternoon', 'evening', 'night'].map(period => {
      const periodAppointments = filteredAppointments.filter(apt => {
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
      
      const scheduled = periodAppointments.filter(a => a.status !== 'cancelled').length
      const showed = periodAppointments.filter(a => a.status === 'showed' || a.status === 'signed').length
      const signed = periodAppointments.filter(a => a.status === 'signed').length
      
      // Calculate missing PCNs for this period
      const periodMissingPCNs = periodAppointments.filter(isPCNOverdue).length
      
      // Show Rate: Excel uses Shown / (Scheduled - Missing PCNs)
      const periodScheduledMinusMissing = scheduled - periodMissingPCNs
      const periodShowRate = periodScheduledMinusMissing > 0
        ? ((showed / periodScheduledMinusMissing) * 100).toFixed(1)
        : (scheduled > 0 ? ((showed / scheduled) * 100).toFixed(1) : '0')
      
      // Close Rate: Excel uses Closed / Shown
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
    
    // Group by traffic source
    const byTrafficSource = Object.values(
      filteredAppointments.reduce((acc: any, apt) => {
        const key = apt.attributionSource || 'Unknown'
        if (!acc[key]) {
          acc[key] = {
            trafficSource: key,
            total: 0,
            showed: 0,
            signed: 0,
            scheduled: 0,
            revenue: 0
          }
        }
        
        acc[key].total++
        if (apt.status !== 'cancelled') acc[key].scheduled++
        if (apt.status === 'showed' || apt.status === 'signed') acc[key].showed++
        if (apt.status === 'signed') {
          acc[key].signed++
          acc[key].revenue += apt.cashCollected || 0
        }
        
        return acc
      }, {})
    ).map((source: any) => {
      // Calculate missing PCNs for this traffic source's appointments
      const sourceAppointments = filteredAppointments.filter(a => 
        (a.attributionSource || 'Unknown') === source.trafficSource
      )
      const sourceMissingPCNs = sourceAppointments.filter(isPCNOverdue).length
      
      // Show Rate: Excel uses Shown / (Scheduled - Missing PCNs)
      const sourceScheduledMinusMissing = source.scheduled - sourceMissingPCNs
      const sourceShowRate = sourceScheduledMinusMissing > 0
        ? ((source.showed / sourceScheduledMinusMissing) * 100).toFixed(1)
        : (source.scheduled > 0 ? ((source.showed / source.scheduled) * 100).toFixed(1) : '0')
      
      // Close Rate: Excel uses Closed / Shown
      const sourceCloseRate = source.showed > 0 ? ((source.signed / source.showed) * 100).toFixed(1) : '0'
      
      return {
        ...source,
        showRate: sourceShowRate,
        closeRate: sourceCloseRate
      }
    }).sort((a: any, b: any) => b.revenue - a.revenue)
    
    return NextResponse.json({
      totalAppointments,
      scheduled,
      showed,
      signed,
      noShows,
      showRate: parseFloat(showRate),
      closeRate: parseFloat(closeRate),
      totalRevenue,
      avgDealSize: parseFloat(avgDealSize),
      scheduledCallCloseRate: parseFloat(scheduledCallCloseRate),
      revenuePerScheduledCall: parseFloat(revenuePerScheduledCall),
      revenuePerShowedCall: parseFloat(revenuePerShowedCall),
      missingPCNs,
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

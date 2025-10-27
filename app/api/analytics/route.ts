import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    
    const result = await withPrisma(async (prisma: any) => {
      // Build where clause for filters
      const where: any = {}
      
      if (searchParams.get('dateFrom') || searchParams.get('dateTo')) {
        where.scheduledAt = {}
        if (searchParams.get('dateFrom')) {
          where.scheduledAt.gte = new Date(searchParams.get('dateFrom')!)
        }
        if (searchParams.get('dateTo')) {
          where.scheduledAt.lte = new Date(searchParams.get('dateTo')!)
        }
      }
      
      if (searchParams.get('status')) {
        where.status = searchParams.get('status')
      }
      
      if (searchParams.get('dayOfWeek')) {
        // Filter by day of week - you'll need to add this logic
        // This is a simplified approach
        const dayOfWeek = searchParams.get('dayOfWeek')
        // For now, we'll skip this filter or implement via raw query
      }
      
      if (searchParams.get('objectionType')) {
        where.objectionType = searchParams.get('objectionType')
      }
      
      // Get all appointments matching filters
      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          closer: true,
          contact: true
        }
      })
      
      // Apply day of week filter if provided
      let filteredAppointments = appointments
      if (searchParams.get('dayOfWeek')) {
        const dayOfWeek = parseInt(searchParams.get('dayOfWeek')!)
        filteredAppointments = appointments.filter((apt: any) => 
          new Date(apt.scheduledAt).getDay() === dayOfWeek
        )
      }
      
      // Calculate metrics
      const totalAppointments = filteredAppointments.length
      const scheduled = filteredAppointments.filter((a: any) => a.status !== 'cancelled').length
      const showed = filteredAppointments.filter((a: any) => a.status === 'showed' || a.status === 'signed').length
      const signed = filteredAppointments.filter((a: any) => a.status === 'signed').length
      
      const showRate = scheduled > 0 ? ((showed / scheduled) * 100).toFixed(1) : '0'
      const closeRate = showed > 0 ? ((signed / showed) * 100).toFixed(1) : '0'
      
      const totalRevenue = filteredAppointments
        .reduce((sum: number, apt: any) => sum + (apt.cashCollected || 0), 0)
      
      // Group by closer
      const byCloser = Object.values(
        filteredAppointments.reduce((acc: any, apt: any) => {
          if (!apt.closer) return acc
          
          const key = apt.closer.email
          if (!acc[key]) {
            acc[key] = {
              closerEmail: apt.closer.email,
              closerName: apt.closer.name,
              total: 0,
              showed: 0,
              signed: 0,
              scheduled: 0
            }
          }
          
          acc[key].total++
          if (apt.status !== 'cancelled') acc[key].scheduled++
          if (apt.status === 'showed' || apt.status === 'signed') acc[key].showed++
          if (apt.status === 'signed') acc[key].signed++
          
          return acc
        }, {})
      ).map((closer: any) => ({
        ...closer,
        showRate: closer.scheduled > 0 ? ((closer.showed / closer.scheduled) * 100).toFixed(1) : '0',
        closeRate: closer.showed > 0 ? ((closer.signed / closer.showed) * 100).toFixed(1) : '0'
      }))
      
      // Group by day of week
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const byDayOfWeek = Object.values(
        filteredAppointments.reduce((acc: any, apt: any) => {
          const day = new Date(apt.scheduledAt).getDay()
          
          if (!acc[day]) {
            acc[day] = {
              dayOfWeek: day,
              dayName: dayNames[day],
              total: 0,
              showed: 0,
              signed: 0,
              scheduled: 0
            }
          }
          
          acc[day].total++
          if (apt.status !== 'cancelled') acc[day].scheduled++
          if (apt.status === 'showed' || apt.status === 'signed') acc[day].showed++
          if (apt.status === 'signed') acc[day].signed++
          
          return acc
        }, {})
      ).map((day: any) => ({
        ...day,
        showRate: day.scheduled > 0 ? ((day.showed / day.scheduled) * 100).toFixed(1) : '0',
        closeRate: day.showed > 0 ? ((day.signed / day.showed) * 100).toFixed(1) : '0'
      }))
        .sort((a: any, b: any) => dayNames.indexOf(a.dayName) - dayNames.indexOf(b.dayName))
      
      return {
        totalAppointments,
        scheduled,
        showed,
        signed,
        showRate,
        closeRate,
        totalRevenue,
        byCloser: byCloser.sort((a: any, b: any) => b.total - a.total),
        byDayOfWeek
      }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}


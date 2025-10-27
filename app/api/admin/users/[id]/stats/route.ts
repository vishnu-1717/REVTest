import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await requireAdmin()
    
    // Get date range from query params (default to all time)
    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')
    
    const dateFilter: any = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom)
    if (dateTo) dateFilter.lte = new Date(dateTo)
    
    const stats = await withPrisma(async (prisma) => {
      // Get appointments
      const appointments = await prisma.appointment.findMany({
        where: {
          closerId: params.id,
          companyId: currentUser.companyId,
          ...(Object.keys(dateFilter).length > 0 && {
            scheduledAt: dateFilter
          })
        }
      })
      
      // Get commissions
      const commissions = await prisma.commission.findMany({
        where: {
          repId: params.id,
          companyId: currentUser.companyId
        },
        include: {
          Sale: true
        }
      })
      
      // Calculate stats
      const totalAppointments = appointments.length
      const scheduled = appointments.filter(a => a.status !== 'cancelled').length
      const showed = appointments.filter(a => a.status === 'showed' || a.status === 'signed').length
      const signed = appointments.filter(a => a.status === 'signed').length
      
      const showRate = scheduled > 0 ? ((showed / scheduled) * 100).toFixed(1) : 0
      const closeRate = showed > 0 ? ((signed / showed) * 100).toFixed(1) : 0
      
      const totalRevenue = appointments
        .reduce((sum, apt) => sum + (apt.cashCollected || 0), 0)
      
      const totalCommissions = commissions
        .reduce((sum, com) => sum + Number(com.totalAmount), 0)
      
      const pendingCommissions = commissions
        .filter(c => c.releaseStatus === 'pending' || c.releaseStatus === 'partial')
        .reduce((sum, com) => sum + (Number(com.totalAmount) - Number(com.releasedAmount)), 0)
      
      const paidCommissions = commissions
        .filter(c => c.releaseStatus === 'paid')
        .reduce((sum, com) => sum + Number(com.totalAmount), 0)
      
      return {
        totalAppointments,
        scheduled,
        showed,
        signed,
        showRate: parseFloat(showRate),
        closeRate: parseFloat(closeRate),
        totalRevenue,
        totalCommissions,
        pendingCommissions,
        paidCommissions,
        commissionCount: commissions.length
      }
    })
    
    return NextResponse.json(stats)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

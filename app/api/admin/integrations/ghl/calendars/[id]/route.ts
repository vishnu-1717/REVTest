import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

// Update individual calendar
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin()
    const updates = await request.json()
    const { id } = await params
    
    // Validate updates
    const allowedFields = ['trafficSource', 'calendarType', 'defaultCloserId']
    const filteredUpdates: any = {}
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value
      }
    }
    
    await withPrisma(async (prisma) => {
      return await prisma.calendar.update({
        where: {
          id: id,
          companyId: user.companyId // Security: only update own calendars
        },
        data: filteredUpdates
      })
    })
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('Calendar update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Update individual calendar
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin()
    const updates = await request.json()
    
    // Validate updates
    const allowedFields = ['trafficSource', 'calendarType', 'defaultCloserId']
    const filteredUpdates: any = {}
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value
      }
    }
    
    await prisma.calendar.update({
      where: {
        id: params.id,
        companyId: user.companyId // Security: only update own calendars
      },
      data: filteredUpdates
    })
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('Calendar update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
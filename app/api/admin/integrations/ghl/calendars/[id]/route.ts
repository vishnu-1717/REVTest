import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { getEffectiveCompanyId } from '@/lib/company-context'

// Update individual calendar
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to modify this company' },
        { status: 403 }
      )
    }

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
          companyId // Security: ensure calendar belongs to target company
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
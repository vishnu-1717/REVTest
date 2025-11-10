import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { getEffectiveCompanyId } from '@/lib/company-context'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to modify this company' },
        { status: 403 }
      )
    }

    const { 
      attributionStrategy, 
      attributionSourceField,
      useCalendarsForAttribution 
    } = await request.json()
    
    // Validate strategy
    const validStrategies = ['ghl_fields', 'calendars', 'hyros', 'tags', 'none']
    if (!validStrategies.includes(attributionStrategy)) {
      return NextResponse.json(
        { error: 'Invalid attribution strategy' },
        { status: 400 }
      )
    }
    
    // Update company
    await withPrisma(async (prisma) => {
      return await prisma.company.update({
        where: { id: companyId },
        data: {
          attributionStrategy,
          attributionSourceField: attributionStrategy === 'ghl_fields' 
            ? attributionSourceField 
            : null,
          useCalendarsForAttribution: attributionStrategy === 'calendars'
        }
      })
    })
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

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

    const body = await request.json()
    const { 
      attributionStrategy, 
      attributionSourceField,
      useCalendarsForAttribution 
    } = body
    
    console.log('[Attribution] Saving attribution settings:', {
      companyId,
      attributionStrategy,
      attributionSourceField,
      useCalendarsForAttribution
    })
    
    // Validate strategy
    const validStrategies = ['ghl_fields', 'calendars', 'hyros', 'tags', 'none']
    if (!attributionStrategy || !validStrategies.includes(attributionStrategy)) {
      console.error('[Attribution] Invalid strategy:', attributionStrategy)
      return NextResponse.json(
        { error: `Invalid attribution strategy: ${attributionStrategy}. Must be one of: ${validStrategies.join(', ')}` },
        { status: 400 }
      )
    }
    
    // Validate attributionSourceField for ghl_fields strategy
    if (attributionStrategy === 'ghl_fields' && !attributionSourceField) {
      console.error('[Attribution] Missing attributionSourceField for ghl_fields strategy')
      return NextResponse.json(
        { error: 'attributionSourceField is required when using ghl_fields strategy' },
        { status: 400 }
      )
    }
    
    // Update company
    await withPrisma(async (prisma) => {
      const updateData: any = {
        attributionStrategy,
        useCalendarsForAttribution: attributionStrategy === 'calendars'
      }
      
      // Only set attributionSourceField if using ghl_fields strategy
      if (attributionStrategy === 'ghl_fields') {
        updateData.attributionSourceField = attributionSourceField || 'contact.source'
      } else {
        updateData.attributionSourceField = null
      }
      
      console.log('[Attribution] Updating company with data:', updateData)
      
      return await prisma.company.update({
        where: { id: companyId },
        data: updateData
      })
    })
    
    console.log('[Attribution] Successfully saved attribution settings for company:', companyId)
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('[Attribution] Error saving attribution settings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save attribution settings' },
      { status: 500 }
    )
  }
}

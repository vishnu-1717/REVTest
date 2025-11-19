import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin()
    
    const { userId } = await params
    const companyId = await getEffectiveCompanyId(request.url)
    const body = await request.json()
    const { slackUserId, slackUserName } = body
    
    // Verify user belongs to company
    const user = await withPrisma(async (prisma) => {
      const foundUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      })
      
      if (!foundUser) {
        throw new Error('User not found')
      }
      
      if (foundUser.companyId !== companyId) {
        throw new Error('Unauthorized')
      }
      
      // Update user's Slack mapping
      return await prisma.user.update({
        where: { id: userId },
        data: {
          slackUserId: slackUserId || null,
          slackUserName: slackUserName || null,
        },
        select: {
          id: true,
          name: true,
          slackUserId: true,
          slackUserName: true,
        },
      })
    })
    
    return NextResponse.json({ user })
  } catch (error: any) {
    console.error('[Slack User Mapping] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}


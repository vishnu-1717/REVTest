import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { getEffectiveUser } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Verify admin permissions
    if (user.role !== 'admin' && !user.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    console.log('Users API - Effective user:', {
      id: user.id,
      name: user.name,
      companyId: user.companyId,
      isImpersonating: (user as any)._impersonating
    })
    
    const users = await withPrisma(async (prisma) => {
      const where: any = {}
      
      // Check if impersonating - if so, always filter by impersonated user's company
      const isImpersonating = (user as any)._impersonating === true
      
      // If impersonating OR not super admin, filter by company
      // This ensures that when a super admin impersonates a user, they only see that user's company data
      if (isImpersonating || !user.superAdmin) {
        where.companyId = user.companyId
      }
      
      console.log('Users API - Where clause:', where, 'isImpersonating:', isImpersonating)
      
      return await prisma.user.findMany({
        where,
        include: {
          commissionRole: true,
          Company: true, // Include for super admin view
          _count: {
            select: {
              AppointmentsAsCloser: true,
              Commission: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    })
    
    console.log('Users API - Found users:', users.length)
    
    return NextResponse.json(users)
  } catch (error: any) {
    console.error('Users API error:', error)
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Verify admin permissions
    if (user.role !== 'admin' && !user.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    const {
      name,
      email,
      role,
      commissionRoleId,
      customCommissionRate,
      canViewTeamMetrics,
      companyId
    } = await request.json()

    const targetCompanyId =
      user.superAdmin && companyId ? companyId : user.companyId

    if (!targetCompanyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
    }

    if (!user.superAdmin && companyId && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to assign users to that company' },
        { status: 403 }
      )
    }
    
    const newUser = await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: targetCompanyId }
      })

      if (!company) {
        throw new Error('Selected company not found')
      }

      // Check if user already exists
      const existing = await prisma.user.findFirst({
        where: {
          email,
          companyId: targetCompanyId
        }
      })
      
      if (existing) {
        throw new Error('User with this email already exists')
      }
      
      return await prisma.user.create({
        data: {
          name,
          email,
          role: role || 'rep',
          companyId: targetCompanyId,
          commissionRoleId: commissionRoleId || null,
          customCommissionRate: customCommissionRate ? parseFloat(customCommissionRate) / 100 : null,
          canViewTeamMetrics: canViewTeamMetrics || false,
          isActive: false,
          customFields: {
            ...(user.superAdmin ? { invitedBySuperAdmin: true } : {}),
            invitation: {
              status: 'pending',
              invitedAt: new Date().toISOString(),
              invitedBy: user.id
            }
          }
        },
        include: {
          commissionRole: true
        }
      })
    })
    
    // Send invite email via Clerk (if configured)
    let invitationId: string | null = null
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    if (!process.env.CLERK_SECRET_KEY) {
      console.warn('[Users API] CLERK_SECRET_KEY not set; skipping automatic invite email.')
    } else {
      try {
        const clerk = await clerkClient()
        const invitation = await clerk.invitations.createInvitation({
          emailAddress: email,
          redirectUrl: `${appUrl}/sign-in?redirect_url=/`,
          publicMetadata: {
            companyId: targetCompanyId,
            invitedByUserId: user.id
          },
        })
        invitationId = invitation.id
      } catch (error) {
        console.error('[Users API] Failed to send Clerk invitation:', error)
      }
    }
    
    if (invitationId) {
      await withPrisma(async (prisma) => {
        const existingCustomFields = (newUser.customFields as Record<string, unknown> | null) ?? {}
        await prisma.user.update({
          where: { id: newUser.id },
          data: {
            customFields: {
              ...existingCustomFields,
              invitation: {
                ...(existingCustomFields as any)?.invitation,
                status: 'pending',
                invitedAt: new Date().toISOString(),
                invitedBy: user.id,
                invitationId
              }
            }
          }
        })
      })
    }
    
    return NextResponse.json(newUser)
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

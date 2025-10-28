import { NextResponse } from 'next/server'
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
      
      // If not super admin, filter by company
      if (!user.superAdmin) {
        where.companyId = user.companyId
      }
      
      console.log('Users API - Where clause:', where)
      
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
    
    const { name, email, role, commissionRoleId, customCommissionRate, canViewTeamMetrics } = await request.json()
    
    const newUser = await withPrisma(async (prisma) => {
      // Check if user already exists
      const existing = await prisma.user.findFirst({
        where: {
          email,
          companyId: user.companyId
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
          companyId: user.companyId,
          commissionRoleId: commissionRoleId || null,
          customCommissionRate: customCommissionRate ? parseFloat(customCommissionRate) / 100 : null,
          canViewTeamMetrics: canViewTeamMetrics || false,
          isActive: true
        },
        include: {
          commissionRole: true
        }
      })
    })
    
    // TODO: Send invite email via Clerk
    // For now, user needs to sign up with this email
    
    return NextResponse.json(newUser)
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

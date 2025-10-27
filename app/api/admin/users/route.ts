import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await requireAdmin()
    
    const users = await withPrisma(async (prisma) => {
      return await prisma.user.findMany({
        where: {
          companyId: user.companyId
        },
        include: {
          commissionRole: true,
          _count: {
            select: {
              appointmentsAsCloser: true,
              commissions: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    })
    
    return NextResponse.json(users)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
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

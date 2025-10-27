import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    await requireSuperAdmin()
    
    const { searchParams } = new URL(request.url)
    const companyFilter = searchParams.get('company')
    const roleFilter = searchParams.get('role')
    const search = searchParams.get('search')
    
    const users = await withPrisma(async (prisma) => {
      const where: any = {}
      
      if (companyFilter) {
        where.companyId = companyFilter
      }
      
      if (roleFilter) {
        where.role = roleFilter
      }
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      }
      
      return await prisma.user.findMany({
        where,
        include: {
          Company: {
            select: {
              name: true
            }
          },
          commissionRole: true,
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
    
    return NextResponse.json(users)
  } catch (error: any) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    )
  }
}


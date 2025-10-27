import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await requireAdmin()
    
    const roles = await withPrisma(async (prisma) => {
      return await prisma.commissionRole.findMany({
        where: {
          companyId: user.companyId
        },
        include: {
          _count: {
            select: { users: true }
          }
        },
        orderBy: {
          name: 'asc'
        }
      })
    })
    
    return NextResponse.json(roles)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const { name, defaultRate, description } = await request.json()
    
    const role = await withPrisma(async (prisma) => {
      // Check if role already exists
      const existing = await prisma.commissionRole.findUnique({
        where: {
          companyId_name: {
            companyId: user.companyId,
            name
          }
        }
      })
      
      if (existing) {
        throw new Error('Role with this name already exists')
      }
      
      return await prisma.commissionRole.create({
        data: {
          name,
          defaultRate: parseFloat(defaultRate),
          description,
          companyId: user.companyId
        }
      })
    })
    
    return NextResponse.json(role)
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

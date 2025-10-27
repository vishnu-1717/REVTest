import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    await requireSuperAdmin()
    
    const companies = await withPrisma(async (prisma) => {
      return await prisma.company.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: {
            select: {
              User: true,
              Appointment: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    })
    
    return NextResponse.json(companies)
  } catch (error: any) {
    console.error('Error fetching companies:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    )
  }
}


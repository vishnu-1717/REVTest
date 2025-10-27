import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id },
        include: {
          User: {
            include: {
              commissionRole: true,
              _count: {
                select: {
                  AppointmentsAsCloser: true,
                  Commission: true
                }
              }
            }
          },
          CommissionRole: true,
          _count: {
            select: {
              Appointment: true,
              Sale: true,
              Commission: true
            }
          }
        }
      })
    })
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(company)
  } catch (error: any) {
    console.error('Error fetching company:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    )
  }
}


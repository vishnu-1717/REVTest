import { NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getEffectiveUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'admin' && !user.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const companies = await withPrisma(async (prisma) => {
      if (user.superAdmin) {
        return prisma.company.findMany({
          select: {
            id: true,
            name: true,
            email: true
          },
          orderBy: {
            name: 'asc'
          }
        })
      }

      return prisma.company.findMany({
        where: { id: user.companyId ?? undefined },
        select: {
          id: true,
          name: true,
          email: true
        }
      })
    })

    return NextResponse.json(companies)
  } catch (error: any) {
    console.error('Error fetching admin companies:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}


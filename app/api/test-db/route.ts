import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    // Test basic connection using withPrisma pattern
    const result = await withPrisma(async (prisma) => {
      // Test a simple query (avoiding prepared statements)
      return await prisma.$queryRaw`SELECT 1 as test`
    })
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection successful',
      result,
      connectionString: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'), // Hide password
      poolerInfo: {
        isTransactionPooler: process.env.DATABASE_URL?.includes('pooler.supabase.com'),
        port: process.env.DATABASE_URL?.includes(':6543') ? '6543 (Transaction Pooler)' : '5432 (Direct)',
        hasPgbouncer: process.env.DATABASE_URL?.includes('pgbouncer=true')
      }
    })
  } catch (error: any) {
    console.error('Database connection error:', error)
    
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      code: error.code,
      connectionString: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'),
      poolerInfo: {
        isTransactionPooler: process.env.DATABASE_URL?.includes('pooler.supabase.com'),
        port: process.env.DATABASE_URL?.includes(':6543') ? '6543 (Transaction Pooler)' : '5432 (Direct)',
        hasPgbouncer: process.env.DATABASE_URL?.includes('pgbouncer=true')
      },
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDirectUrl: !!process.env.DIRECT_URL,
        nodeEnv: process.env.NODE_ENV
      }
    }, { status: 500 })
  }
}

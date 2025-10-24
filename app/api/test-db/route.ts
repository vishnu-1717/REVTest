import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export async function GET() {
  const prisma = new PrismaClient({
    log: ['query', 'error', 'warn'],
  })

  try {
    // Test basic connection
    await prisma.$connect()
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection successful',
      result,
      connectionString: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@') // Hide password
    })
  } catch (error: any) {
    console.error('Database connection error:', error)
    
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      code: error.code,
      connectionString: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'),
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDirectUrl: !!process.env.DIRECT_URL,
        nodeEnv: process.env.NODE_ENV
      }
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

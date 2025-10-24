import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasDirectUrl: !!process.env.DIRECT_URL,
    databaseUrlLength: process.env.DATABASE_URL?.length || 0,
    directUrlLength: process.env.DIRECT_URL?.length || 0,
    nodeEnv: process.env.NODE_ENV,
    // Don't expose the actual URLs for security
    databaseUrlPreview: process.env.DATABASE_URL?.substring(0, 50) + '...',
    directUrlPreview: process.env.DIRECT_URL?.substring(0, 50) + '...'
  })
}

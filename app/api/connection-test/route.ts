import { NextResponse } from 'next/server'

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL
  
  if (!databaseUrl) {
    return NextResponse.json({ 
      error: 'DATABASE_URL not found in environment variables' 
    }, { status: 500 })
  }

  // Parse the connection string to show what we're actually using
  const url = new URL(databaseUrl)
  
  return NextResponse.json({
    connectionDetails: {
      protocol: url.protocol,
      username: url.username,
      hostname: url.hostname,
      port: url.port,
      database: url.pathname.substring(1),
      searchParams: Object.fromEntries(url.searchParams.entries())
    },
    isCorrectFormat: {
      hasProjectIdInUsername: url.username.includes('rmosfguaczwfcuofoxnc'),
      isPoolerHostname: url.hostname.includes('pooler.supabase.com'),
      isCorrectPort: url.port === '6543',
      hasPgbouncer: url.searchParams.get('pgbouncer') === 'true'
    },
    recommendations: {
      shouldUsePooler: url.hostname.includes('pooler.supabase.com'),
      shouldHaveProjectId: url.username.includes('rmosfguaczwfcuofoxnc'),
      correctFormat: 'postgresql://postgres.rmosfguaczwfcuofoxnc:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres'
    }
  })
}

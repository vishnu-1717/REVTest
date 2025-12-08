import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') })
// Also try .env as fallback
dotenv.config({ path: path.join(process.cwd(), '.env') })

const prisma = new PrismaClient()

async function clearGHLOAuthTokens() {
  console.log('🔄 Clearing GHL OAuth tokens to allow reconnection...\n')

  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { ghlOAuthAccessToken: { not: null } },
        { ghlOAuthRefreshToken: { not: null } }
      ]
    },
    select: {
      id: true,
      name: true,
      ghlOAuthAccessToken: true,
      ghlOAuthRefreshToken: true
    }
  })

  console.log(`Found ${companies.length} companies with GHL OAuth tokens\n`)

  if (companies.length === 0) {
    console.log('✅ No companies with GHL OAuth tokens found')
    await prisma.$disconnect()
    return
  }

  for (const company of companies) {
    console.log(`Clearing tokens for: ${company.name} (${company.id})`)
    
    await prisma.company.update({
      where: { id: company.id },
      data: {
        ghlOAuthAccessToken: null,
        ghlOAuthRefreshToken: null,
        ghlOAuthExpiresAt: null
      }
    })
    
    console.log(`  ✅ Cleared tokens`)
  }

  console.log(`\n✅ Cleared tokens for ${companies.length} companies`)
  console.log('\n📝 Next steps:')
  console.log('   1. Go to Admin > Integrations > GHL')
  console.log('   2. Click "Connect GHL" to reconnect OAuth')
  console.log('   3. After reconnecting, run the backfill script again')
  
  await prisma.$disconnect()
}

clearGHLOAuthTokens()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })


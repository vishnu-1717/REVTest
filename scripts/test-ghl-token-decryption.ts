#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { getGHLAccessToken } from '@/lib/ghl-oauth'

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') })
// Also try .env as fallback
dotenv.config({ path: path.join(process.cwd(), '.env') })

const prisma = new PrismaClient()

async function testDecryption() {
  console.log('🔍 Testing GHL token decryption...\n')
  console.log(`ENCRYPTION_KEY is ${process.env.ENCRYPTION_KEY ? 'SET' : 'NOT SET'}`)
  if (process.env.ENCRYPTION_KEY) {
    console.log(`ENCRYPTION_KEY length: ${process.env.ENCRYPTION_KEY.length} characters\n`)
  }

  try {
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

    console.log(`Found ${companies.length} companies with GHL tokens\n`)

    for (const company of companies) {
      console.log(`Testing company: ${company.name} (${company.id})`)
      
      if (company.ghlOAuthAccessToken) {
        console.log(`  Access token exists: ${company.ghlOAuthAccessToken.substring(0, 20)}...`)
      }
      
      if (company.ghlOAuthRefreshToken) {
        console.log(`  Refresh token exists: ${company.ghlOAuthRefreshToken.substring(0, 20)}...`)
      }

      try {
        const token = await getGHLAccessToken(company.id)
        if (token) {
          console.log(`  ✅ Successfully decrypted access token!`)
        } else {
          console.log(`  ❌ Failed to get access token (returned null)`)
        }
      } catch (error: any) {
        console.log(`  ❌ Decryption error: ${error.message}`)
      }
      
      console.log('')
    }
  } finally {
    await prisma.$disconnect()
  }
}

testDecryption()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })


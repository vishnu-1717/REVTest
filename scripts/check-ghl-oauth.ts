import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkGHLOAuth() {
  try {
    // Find Budgetdog company
    const company = await prisma.company.findFirst({
      where: {
        name: {
          contains: 'Budgetdog',
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        ghlOAuthAccessToken: true,
        ghlOAuthRefreshToken: true,
        ghlOAuthExpiresAt: true,
        ghlAppInstalledAt: true,
        ghlAppUninstalledAt: true,
        ghlLocationId: true,
        ghlMarketplaceClientId: true,
        ghlApiKey: true
      }
    })

    if (!company) {
      console.log('❌ Budgetdog company not found')
      return
    }

    console.log('\n📊 Budgetdog GHL Connection Status:')
    console.log('=====================================')
    console.log(`Company: ${company.name}`)
    console.log(`Email: ${company.email}`)
    console.log(`Company ID: ${company.id}`)
    console.log('\n🔐 OAuth Status:')
    console.log(`  Access Token: ${company.ghlOAuthAccessToken ? '✅ Present (encrypted)' : '❌ Missing'}`)
    console.log(`  Refresh Token: ${company.ghlOAuthRefreshToken ? '✅ Present (encrypted)' : '❌ Missing'}`)
    console.log(`  Expires At: ${company.ghlOAuthExpiresAt ? company.ghlOAuthExpiresAt.toISOString() : '❌ Not set'}`)
    console.log(`  App Installed At: ${company.ghlAppInstalledAt ? company.ghlAppInstalledAt.toISOString() : '❌ Not set'}`)
    console.log(`  App Uninstalled At: ${company.ghlAppUninstalledAt ? company.ghlAppUninstalledAt.toISOString() : '✅ Not uninstalled'}`)
    console.log(`  Location ID: ${company.ghlLocationId || '❌ Not set'}`)
    console.log(`  Marketplace Client ID: ${company.ghlMarketplaceClientId ? '✅ Set' : '❌ Not set'}`)
    
    console.log('\n🔑 Legacy API Key Status:')
    console.log(`  API Key: ${company.ghlApiKey ? '✅ Present' : '❌ Not set'}`)
    
    // Determine connection status
    const oauthConnected = !!(
      company.ghlOAuthAccessToken &&
      company.ghlOAuthRefreshToken &&
      !company.ghlAppUninstalledAt
    )
    
    console.log('\n✅ Overall OAuth Connection Status:')
    console.log(`  ${oauthConnected ? '✅ CONNECTED via OAuth' : '❌ NOT CONNECTED via OAuth'}`)
    
    if (oauthConnected) {
      console.log('\n🎉 Budgetdog IS connected to GHL via OAuth!')
      console.log('   The "invalid_request" error may have been a false negative.')
      console.log('   The connection likely succeeded despite the error message.')
    } else {
      console.log('\n⚠️  Budgetdog is NOT connected via OAuth')
      console.log('   The connection did not complete successfully.')
    }
    
  } catch (error) {
    console.error('Error checking OAuth status:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkGHLOAuth()


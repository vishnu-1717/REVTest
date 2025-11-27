#!/usr/bin/env tsx

/**
 * Environment Variable Checker
 * 
 * Checks which environment variables are set and which are missing.
 * Run with: npx tsx scripts/check-env-vars.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') })
// Also try .env as fallback
dotenv.config({ path: path.join(process.cwd(), '.env') })

interface EnvVar {
  name: string
  required: boolean
  description: string
  category: string
}

const envVars: EnvVar[] = [
  // Database (Required)
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL database connection string',
    category: 'Database'
  },
  {
    name: 'DIRECT_URL',
    required: true,
    description: 'Direct PostgreSQL connection (bypasses pooler)',
    category: 'Database'
  },
  
  // Clerk Authentication (Required)
  {
    name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    required: true,
    description: 'Clerk publishable key',
    category: 'Authentication'
  },
  {
    name: 'CLERK_SECRET_KEY',
    required: true,
    description: 'Clerk secret key',
    category: 'Authentication'
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    required: true,
    description: 'Application URL (e.g., http://localhost:3000)',
    category: 'Authentication'
  },
  
  // OpenAI (Required for AI features)
  {
    name: 'OPENAI_API_KEY',
    required: true,
    description: 'OpenAI API key for AI features',
    category: 'AI Features'
  },
  
  // Encryption Key (Required for OAuth token encryption)
  {
    name: 'ENCRYPTION_KEY',
    required: true,
    description: '32-byte hex string for OAuth token encryption (generate with: openssl rand -hex 32)',
    category: 'Security'
  },
  
  // GHL Marketplace OAuth
  {
    name: 'GHL_MARKETPLACE_CLIENT_ID',
    required: false,
    description: 'GHL Marketplace OAuth client ID',
    category: 'GHL Integration'
  },
  {
    name: 'GHL_MARKETPLACE_CLIENT_SECRET',
    required: false,
    description: 'GHL Marketplace OAuth client secret',
    category: 'GHL Integration'
  },
  {
    name: 'GHL_OAUTH_REDIRECT_URI',
    required: false,
    description: 'GHL OAuth redirect URI',
    category: 'GHL Integration'
  },
  {
    name: 'GHL_MARKETPLACE_WEBHOOK_SECRET',
    required: false,
    description: 'GHL Marketplace webhook secret',
    category: 'GHL Integration'
  },
  
  // Zoom (Optional - for webhook signature verification)
  {
    name: 'ZOOM_WEBHOOK_SECRET',
    required: false,
    description: 'Zoom webhook secret for signature verification',
    category: 'Zoom Integration'
  },
  
  // Cron (Optional - for securing cron endpoints)
  {
    name: 'CRON_SECRET',
    required: false,
    description: 'Secret for securing cron endpoints',
    category: 'Cron Jobs'
  },
  
  // Slack (if using Slack integration)
  {
    name: 'SLACK_BOT_TOKEN',
    required: false,
    description: 'Slack bot token (xoxb-...)',
    category: 'Slack Integration'
  },
  {
    name: 'SLACK_SIGNING_SECRET',
    required: false,
    description: 'Slack signing secret for webhook verification',
    category: 'Slack Integration'
  },
  
  // Super Admin Emails (comma-separated, optional)
  {
    name: 'SUPER_ADMIN_EMAILS',
    required: false,
    description: 'Comma-separated list of super admin emails',
    category: 'Admin'
  },
  
  // Default Company Email (optional)
  {
    name: 'DEFAULT_COMPANY_EMAIL',
    required: false,
    description: 'Default company email',
    category: 'Admin'
  }
]

function checkEnvVars() {
  console.log('🔍 Checking Environment Variables...\n')
  console.log('=' .repeat(80))
  
  const results = envVars.map(envVar => {
    const value = process.env[envVar.name]
    const isSet = !!value
    const isMasked = value && value.length > 10
    
    return {
      ...envVar,
      isSet,
      value: isSet ? (isMasked ? `${value.substring(0, 10)}...` : value) : null
    }
  })
  
  // Group by category
  const byCategory = results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = []
    }
    acc[result.category].push(result)
    return acc
  }, {} as Record<string, typeof results>)
  
  // Print results by category
  for (const [category, vars] of Object.entries(byCategory)) {
    console.log(`\n📁 ${category}`)
    console.log('-'.repeat(80))
    
    for (const envVar of vars) {
      const status = envVar.isSet ? '✅' : (envVar.required ? '❌' : '⚠️ ')
      const required = envVar.required ? '(REQUIRED)' : '(OPTIONAL)'
      const value = envVar.isSet ? ` = ${envVar.value}` : ''
      
      console.log(`${status} ${envVar.name} ${required}`)
      console.log(`   ${envVar.description}${value}`)
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('\n📊 Summary\n')
  
  const required = results.filter(r => r.required)
  const optional = results.filter(r => !r.required)
  const requiredSet = required.filter(r => r.isSet)
  const optionalSet = optional.filter(r => r.isSet)
  
  const requiredMissing = required.filter(r => !r.isSet)
  const optionalMissing = optional.filter(r => !r.isSet)
  
  console.log(`Required Variables: ${requiredSet.length}/${required.length} set`)
  if (requiredMissing.length > 0) {
    console.log(`\n❌ Missing Required Variables (${requiredMissing.length}):`)
    requiredMissing.forEach(v => {
      console.log(`   - ${v.name}`)
    })
  }
  
  console.log(`\nOptional Variables: ${optionalSet.length}/${optional.length} set`)
  if (optionalMissing.length > 0 && optionalMissing.length <= 10) {
    console.log(`\n⚠️  Missing Optional Variables (${optionalMissing.length}):`)
    optionalMissing.forEach(v => {
      console.log(`   - ${v.name}`)
    })
  } else if (optionalMissing.length > 10) {
    console.log(`\n⚠️  ${optionalMissing.length} optional variables not set`)
  }
  
  // Generate .env.local template
  console.log('\n' + '='.repeat(80))
  console.log('\n💡 To create .env.local, copy this template and fill in the values:\n')
  console.log('# Copy from Vercel Dashboard: Settings → Environment Variables\n')
  
  for (const [category, vars] of Object.entries(byCategory)) {
    console.log(`# ${category}`)
    for (const envVar of vars) {
      const comment = envVar.required ? '# REQUIRED' : '# OPTIONAL'
      const placeholder = envVar.name === 'NEXT_PUBLIC_APP_URL'
        ? 'http://localhost:3000'
        : 'your-value-here'
      
      console.log(`${comment}`)
      if (envVar.name === 'ENCRYPTION_KEY') {
        console.log('# Generate with: openssl rand -hex 32')
      }
      console.log(`${envVar.name}=${placeholder}`)
      console.log('')
    }
  }
  
  // Exit code
  const allRequiredSet = requiredMissing.length === 0
  if (!allRequiredSet) {
    console.log('\n❌ Some required environment variables are missing!')
    process.exit(1)
  } else {
    console.log('\n✅ All required environment variables are set!')
    process.exit(0)
  }
}

// Run the check
checkEnvVars()


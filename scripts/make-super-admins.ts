import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const prisma = new PrismaClient()

async function makeSuperAdmins() {
  try {
    // Get emails from environment variable or use defaults
    const emailsString = process.env.SUPER_ADMIN_EMAILS || 'dylan@automatedrev.com,jake@systemizedsales.com'
    const emails = emailsString.split(',').map(e => e.trim())

    console.log(`Making super admins for: ${emails.join(', ')}`)

    for (const email of emails) {
      const result = await prisma.user.updateMany({
        where: { email },
        data: {
          superAdmin: true,
          role: 'admin'
        }
      })

      console.log(`Updated ${result.count} user(s) with email ${email}`)
    }

    console.log('Super admins created successfully!')
  } catch (error) {
    console.error('Error creating super admins:', error)
  } finally {
    await prisma.$disconnect()
  }
}

makeSuperAdmins()


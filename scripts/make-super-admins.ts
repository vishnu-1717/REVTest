import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function makeSuperAdmins() {
  try {
    const emails = ['dylan@automatedrev.com', 'jake@systemizedsales.com']
    
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


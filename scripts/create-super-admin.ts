import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function createSuperAdmin() {
  // Get the current Clerk user ID from environment
  const clerkUserId = process.env.CLERK_USER_ID
  
  if (!clerkUserId) {
    console.log('Please set CLERK_USER_ID environment variable')
    console.log('Run: CLERK_USER_ID=your_clerk_user_id ts-node scripts/create-super-admin.ts')
    process.exit(1)
  }
  
  try {
    // Find or create the user
    const user = await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: {
        superAdmin: true,
        role: 'admin'
      },
      create: {
        clerkId: clerkUserId,
        email: 'superadmin@paymaestro.com',
        name: 'Super Admin',
        role: 'admin',
        superAdmin: true,
        companyId: 'default', // You'll need to update this with a real company ID
        isActive: true
      }
    })
    
    console.log('✅ Super admin created/updated:', user)
  } catch (error) {
    console.error('❌ Error creating super admin:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

createSuperAdmin()

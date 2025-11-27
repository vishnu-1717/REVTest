import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function dropView() {
  try {
    console.log('Dropping CallAnalytics view...')
    await prisma.$executeRawUnsafe('DROP VIEW IF EXISTS "CallAnalytics" CASCADE;')
    console.log('✅ View dropped successfully')
  } catch (error: any) {
    console.error('❌ Error dropping view:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

dropView()


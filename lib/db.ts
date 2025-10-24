import { PrismaClient } from '@prisma/client'

// Global variable to store the Prisma client
declare global {
  var __prisma: PrismaClient | undefined
}

// Create a singleton Prisma client optimized for Supabase transaction pooler
export const prisma = globalThis.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

// Store the client globally to prevent multiple instances
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}

// Graceful shutdown
export const disconnectPrisma = async () => {
  try {
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error disconnecting Prisma:', error)
  }
}

// Handle process termination
process.on('beforeExit', disconnectPrisma)
process.on('SIGINT', disconnectPrisma)
process.on('SIGTERM', disconnectPrisma)

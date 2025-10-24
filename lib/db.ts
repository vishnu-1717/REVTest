import { PrismaClient } from '@prisma/client'

// Global variable to store the Prisma client
declare global {
  var __prisma: PrismaClient | undefined
}

// Create a new Prisma client for each request to avoid prepared statement conflicts
// This is required for Supabase transaction pooler which doesn't support prepared statements
export const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })
}

// For development, use singleton to avoid too many connections
export const prisma = process.env.NODE_ENV === 'production' 
  ? createPrismaClient() 
  : (globalThis.__prisma ??= createPrismaClient())

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

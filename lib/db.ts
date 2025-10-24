import { PrismaClient } from '@prisma/client'

// Create a Prisma client that uses DIRECT connection for Prisma operations
// This bypasses the transaction pooler that doesn't support prepared statements
export const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        // Use DIRECT_URL for Prisma operations to avoid prepared statement conflicts
        url: process.env.DIRECT_URL || process.env.DATABASE_URL,
      },
    },
  })
}

// For Supabase, we need to use direct connection for Prisma operations
// and disconnect immediately to avoid prepared statement conflicts
export const withPrisma = async <T>(callback: (prisma: PrismaClient) => Promise<T>): Promise<T> => {
  const prisma = createPrismaClient()
  try {
    return await callback(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

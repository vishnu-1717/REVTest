import { PrismaClient } from '@prisma/client'

// Singleton pattern for Prisma client with connection pooling
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create a singleton Prisma client that uses DIRECT connection for Prisma operations
// This bypasses the transaction pooler that doesn't support prepared statements
const createPrismaClient = () => {
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

// Reuse the same Prisma client across requests (singleton pattern)
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Legacy wrapper for backwards compatibility - now just passes through to singleton
// Deprecated: Use the exported `prisma` instance directly instead
export const withPrisma = async <T>(callback: (prisma: PrismaClient) => Promise<T>): Promise<T> => {
  return await callback(prisma)
}

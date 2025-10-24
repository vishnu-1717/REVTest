import { PrismaClient } from '@prisma/client'

// Create a new Prisma client for each request to avoid prepared statement conflicts
// This is REQUIRED for Supabase transaction pooler which doesn't support prepared statements
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

// For Supabase transaction pooler, we need to create a fresh client for each request
// and disconnect it immediately to avoid prepared statement conflicts
export const withPrisma = async <T>(callback: (prisma: PrismaClient) => Promise<T>): Promise<T> => {
  const prisma = createPrismaClient()
  try {
    return await callback(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

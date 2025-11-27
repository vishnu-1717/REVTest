import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function createView() {
  try {
    console.log('Creating CallAnalytics view...')
    
    // Drop view if it exists
    await prisma.$executeRawUnsafe('DROP VIEW IF EXISTS "CallAnalytics" CASCADE;')
    
    // Create the view based on the expected schema from ai-query-engine.ts
    // Columns needed: appointmentId, companyId, closerName, contactName, status, outcome, 
    // saleAmount, scheduledAt, leadSource, objectionType, notes, semantic_text, appointmentCashCollected
    const createViewSQL = `
      CREATE VIEW "CallAnalytics" AS
      SELECT 
        a.id as "appointmentId",
        a."companyId",
        COALESCE(closer.name, 'Unassigned') as "closerName",
        c.name as "contactName",
        a.status,
        a.outcome,
        COALESCE(s.amount::numeric, 0) as "saleAmount",
        a."scheduledAt",
        COALESCE(a."attributionSource", ts.name, a.calendar, 'Unknown') as "leadSource",
        a."objectionType",
        a.notes,
        '' as "semantic_text", -- Will be populated by embeddings
        COALESCE(a."cashCollected"::numeric, 0) as "appointmentCashCollected"
      FROM "Appointment" a
      LEFT JOIN "Contact" c ON a."contactId" = c.id
      LEFT JOIN "User" closer ON a."closerId" = closer.id
      LEFT JOIN "TrafficSource" ts ON a."trafficSourceId" = ts.id
      LEFT JOIN "Sale" s ON a."saleId" = s.id
    `
    
    await prisma.$executeRawUnsafe(createViewSQL)
    console.log('✅ CallAnalytics view created successfully')
  } catch (error: any) {
    console.error('❌ Error creating view:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

createView()


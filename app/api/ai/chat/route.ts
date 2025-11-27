import { NextRequest, NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/auth'
import { processQuery } from '@/lib/ai-query-engine'
import { buildCompanyContext } from '@/lib/ai-context'

/**
 * AI Chat API Route
 * POST /api/ai/chat
 * Supports streaming responses
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query, stream = false } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    // Build company context
    const context = await buildCompanyContext(user.companyId)

    // Process query with context
    const result = await processQuery(query, user.companyId)

    // Enhance answer with context if needed
    let answer = result.answer
    if (result.intent === 'insights' || result.intent === 'semantic_search') {
      // Add context to answer
      answer = `${answer}\n\n*Context:* This data is specific to your company's sales performance.`
    }

    // Save query to history
    const { withPrisma } = await import('@/lib/db')
    await withPrisma(async (prisma) => {
      await prisma.aIQuery.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          query,
          intent: result.intent,
          answer,
          sql: result.sql || null,
          sources: result.sources ? (result.sources as any) : null,
          data: result.data ? (result.data as any) : null
        }
      })
    })

    // If streaming requested, use streaming response
    if (stream) {
      // Create a ReadableStream for streaming
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          // Stream the answer in chunks
          const chunks = answer.split(' ')
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '')
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
            await new Promise(resolve => setTimeout(resolve, 50)) // Small delay for streaming effect
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    // Return regular JSON response
    return NextResponse.json({
      answer,
      intent: result.intent,
      sources: result.sources,
      data: result.data
    })
  } catch (error: any) {
    console.error('[AI Chat] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process query' },
      { status: 500 }
    )
  }
}


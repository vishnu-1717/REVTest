import OpenAI from 'openai'
import { withPrisma } from './db'
import { Prisma } from '@prisma/client'

if (!process.env.OPENAI_API_KEY) {
  console.warn('[AI Query Engine] OPENAI_API_KEY not set. AI queries will not work.')
}

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export type QueryIntent = 'metrics' | 'semantic_search' | 'sql_query' | 'insights'

export interface QueryResult {
  intent: QueryIntent
  answer: string
  data?: any
  sql?: string
  sources?: Array<{ appointmentId: string; relevance: number }>
}

/**
 * Classify user query intent
 */
export async function classifyIntent(query: string): Promise<QueryIntent> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  const prompt = `Classify the following sales data query into one of these categories:
- "metrics": Questions about KPIs, rates, counts, averages (e.g., "what's the close rate?", "how many appointments this week?")
- "semantic_search": Questions about specific calls, conversations, or qualitative data (e.g., "who mentioned budget concerns?", "find calls about pricing")
- "sql_query": Complex analytical questions requiring custom SQL (e.g., "show me appointments by closer grouped by week")
- "insights": Questions asking for analysis or recommendations (e.g., "what are the top objections?", "which closer performs best?")

Query: "${query}"

Respond with ONLY one word: metrics, semantic_search, sql_query, or insights`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a query classifier. Respond with only one word: metrics, semantic_search, sql_query, or insights.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 10
    })

    const intent = response.choices[0]?.message?.content?.trim().toLowerCase()
    
    if (intent === 'metrics' || intent === 'semantic_search' || intent === 'sql_query' || intent === 'insights') {
      return intent
    }

    // Default to semantic_search for ambiguous queries
    return 'semantic_search'
  } catch (error: any) {
    console.error('[AI Query Engine] Error classifying intent:', error)
    return 'semantic_search'
  }
}

/**
 * Perform semantic search using embeddings
 */
export async function semanticSearch(
  query: string,
  companyId: string,
  limit: number = 5
): Promise<Array<{ appointmentId: string; relevance: number; text: string }>> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  // Generate query embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  })

  const queryEmbedding = embeddingResponse.data[0].embedding

  // Perform vector similarity search
  // Using Prisma raw query since CallAnalyticsEmbedding is not in schema
  const results = await withPrisma(async (prisma) => {
    // Use raw SQL for pgvector similarity search
    const embeddingArray = `[${queryEmbedding.join(',')}]`
    
    const query = Prisma.sql`
      SELECT 
        "appointmentId",
        "semantic_text",
        1 - (embedding <=> ${embeddingArray}::vector) as relevance
      FROM "CallAnalyticsEmbedding"
      WHERE "companyId" = ${companyId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingArray}::vector
      LIMIT ${limit}
    `

    return await prisma.$queryRaw<Array<{
      appointmentId: string
      semantic_text: string | null
      relevance: number
    }>>(query)
  })

  return results.map(r => ({
    appointmentId: r.appointmentId,
    relevance: r.relevance,
    text: r.semantic_text || ''
  }))
}

/**
 * Generate SQL query from natural language
 */
export async function generateSQL(
  query: string,
  companyId: string,
  schema: string
): Promise<string> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  const prompt = `You are a SQL query generator for a sales analytics database.

Database Schema:
${schema}

IMPORTANT: ALL queries MUST include: WHERE "companyId" = '${companyId}'

User Query: "${query}"

Generate a valid PostgreSQL SQL query that answers this question. 
- Use the CallAnalytics view/table
- Always filter by companyId
- Return only the SQL query, no explanation
- Use proper SQL syntax
- Include relevant columns in SELECT`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a SQL query generator. Return ONLY valid SQL queries, no explanations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    })

    let sql = response.choices[0]?.message?.content?.trim() || ''
    
    // Remove markdown code blocks if present
    sql = sql.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim()
    
    // Ensure companyId filter is present
    if (!sql.toLowerCase().includes('companyid')) {
      // Try to add WHERE clause
      if (sql.toLowerCase().includes('where')) {
        sql = sql.replace(/where/gi, `WHERE "companyId" = '${companyId}' AND`)
      } else {
        // Add WHERE clause before any ORDER BY, LIMIT, etc.
        const orderByIndex = sql.toLowerCase().indexOf('order by')
        const limitIndex = sql.toLowerCase().indexOf('limit')
        const insertIndex = orderByIndex > 0 ? orderByIndex : (limitIndex > 0 ? limitIndex : sql.length)
        sql = sql.slice(0, insertIndex) + ` WHERE "companyId" = '${companyId}'` + sql.slice(insertIndex)
      }
    }

    return sql
  } catch (error: any) {
    console.error('[AI Query Engine] Error generating SQL:', error)
    throw new Error(`Failed to generate SQL: ${error.message}`)
  }
}

/**
 * Execute SQL query safely
 */
export async function executeSQL(
  sql: string,
  companyId: string
): Promise<any[]> {
  // Security: Ensure companyId is in the query
  if (!sql.toLowerCase().includes(`companyid`) || !sql.toLowerCase().includes(companyId.toLowerCase())) {
    throw new Error('SQL query must filter by companyId for security')
  }

  // Additional security: Block dangerous operations
  const dangerousKeywords = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate']
  const sqlLower = sql.toLowerCase()
  for (const keyword of dangerousKeywords) {
    if (sqlLower.includes(keyword)) {
      throw new Error(`SQL query contains forbidden operation: ${keyword}`)
    }
  }

  return await withPrisma(async (prisma) => {
    // Use Prisma raw query
    return await prisma.$queryRawUnsafe(sql)
  })
}

/**
 * Get metrics answer using predefined queries
 */
export async function getMetricsAnswer(
  query: string,
  companyId: string
): Promise<string> {
  // Map common metric questions to queries
  const metricQueries: Record<string, string> = {
    'close rate': `
      SELECT 
        COUNT(*) FILTER (WHERE outcome = 'signed') as closed,
        COUNT(*) FILTER (WHERE status = 'showed') as showed,
        CASE 
          WHEN COUNT(*) FILTER (WHERE status = 'showed') > 0 
          THEN ROUND(
            (COUNT(*) FILTER (WHERE outcome = 'signed')::numeric / 
             COUNT(*) FILTER (WHERE status = 'showed')::numeric) * 100, 
            2
          )
          ELSE 0 
        END as close_rate
      FROM "CallAnalytics"
      WHERE "companyId" = '${companyId}'
    `,
    'show rate': `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'showed') as showed,
        COUNT(*) FILTER (WHERE status IN ('scheduled', 'booked')) as scheduled,
        CASE 
          WHEN COUNT(*) FILTER (WHERE status IN ('scheduled', 'booked')) > 0 
          THEN ROUND(
            (COUNT(*) FILTER (WHERE status = 'showed')::numeric / 
             COUNT(*) FILTER (WHERE status IN ('scheduled', 'booked'))::numeric) * 100, 
            2
          )
          ELSE 0 
        END as show_rate
      FROM "CallAnalytics"
      WHERE "companyId" = '${companyId}'
    `,
    'revenue': `
      SELECT 
        COALESCE(SUM("saleAmount"), 0) as total_revenue,
        COALESCE(SUM("appointmentCashCollected"), 0) as cash_collected
      FROM "CallAnalytics"
      WHERE "companyId" = '${companyId}'
    `
  }

  // Try to match query to predefined metric
  const queryLower = query.toLowerCase()
  for (const [key, sql] of Object.entries(metricQueries)) {
    if (queryLower.includes(key)) {
      try {
        const results = await executeSQL(sql, companyId)
        return formatMetricsAnswer(key, results[0])
      } catch (error: any) {
        console.error(`[AI Query Engine] Error executing ${key} query:`, error)
      }
    }
  }

  // Fallback to SQL generation
  const schema = `CallAnalytics view columns: appointmentId, companyId, closerName, contactName, status, outcome, saleAmount, scheduledAt, leadSource, objectionType, notes, semantic_text, appointmentCashCollected`
  const sql = await generateSQL(query, companyId, schema)
  const results = await executeSQL(sql, companyId)
  
  return formatQueryResults(results)
}

/**
 * Format metrics answer
 */
function formatMetricsAnswer(metric: string, data: any): string {
  if (metric === 'close rate' && data.close_rate !== undefined) {
    return `Close Rate: ${data.close_rate}% (${data.closed} closed out of ${data.showed} showed)`
  }
  if (metric === 'show rate' && data.show_rate !== undefined) {
    return `Show Rate: ${data.show_rate}% (${data.showed} showed out of ${data.scheduled} scheduled)`
  }
  if (metric === 'revenue') {
    const total = (data.total_revenue || 0) + (data.cash_collected || 0)
    return `Total Revenue: $${total.toFixed(2)} (Sales: $${(data.total_revenue || 0).toFixed(2)}, Cash Collected: $${(data.cash_collected || 0).toFixed(2)})`
  }
  return formatQueryResults([data])
}

/**
 * Format query results as text
 */
function formatQueryResults(results: any[]): string {
  if (results.length === 0) {
    return 'No data found.'
  }

  if (results.length === 1) {
    const row = results[0]
    const entries = Object.entries(row)
    return entries.map(([key, value]) => `${key}: ${value}`).join('\n')
  }

  // For multiple rows, summarize
  return `Found ${results.length} results. Here are the first few:\n\n${results.slice(0, 5).map((row, idx) => {
    const entries = Object.entries(row)
    return `${idx + 1}. ${entries.map(([key, value]) => `${key}: ${value}`).join(', ')}`
  }).join('\n')}`
}

/**
 * Generate insights answer
 */
export async function getInsightsAnswer(
  query: string,
  companyId: string
): Promise<string> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  // Get relevant data first
  const schema = `CallAnalytics view columns: appointmentId, companyId, closerName, contactName, status, outcome, saleAmount, scheduledAt, leadSource, objectionType, objectionNotes, notes, semantic_text, appointmentCashCollected`
  const sql = await generateSQL(query, companyId, schema)
  const data = await executeSQL(sql, companyId)

  if (data.length === 0) {
    return 'No data available to generate insights.'
  }

  const prompt = `Based on this sales data, provide insights and analysis:

Data:
${JSON.stringify(data.slice(0, 20), null, 2)}

User Question: "${query}"

Provide a clear, concise answer with insights and recommendations.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a sales analytics expert. Provide clear, actionable insights based on data.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    })

    return response.choices[0]?.message?.content || 'Unable to generate insights.'
  } catch (error: any) {
    console.error('[AI Query Engine] Error generating insights:', error)
    return `Error generating insights: ${error.message}`
  }
}

/**
 * Main query processing function
 */
export async function processQuery(
  query: string,
  companyId: string
): Promise<QueryResult> {
  try {
    // Classify intent
    const intent = await classifyIntent(query)

    let answer: string
    let data: any = null
    let sql: string | undefined
    let sources: Array<{ appointmentId: string; relevance: number }> | undefined

    switch (intent) {
      case 'metrics':
        answer = await getMetricsAnswer(query, companyId)
        break

      case 'semantic_search':
        const searchResults = await semanticSearch(query, companyId, 5)
        sources = searchResults.map(r => ({
          appointmentId: r.appointmentId,
          relevance: r.relevance
        }))
        
        // Generate answer from search results
        if (!openai) {
          answer = `Found ${searchResults.length} relevant calls.`
        } else {
          const context = searchResults.map((r, idx) => 
            `${idx + 1}. ${r.text.substring(0, 200)}...`
          ).join('\n\n')
          
          const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'Answer questions based on the provided call data context.'
              },
              {
                role: 'user',
                content: `Context from sales calls:\n\n${context}\n\nQuestion: ${query}`
              }
            ],
            temperature: 0.7,
            max_tokens: 300
          })
          
          answer = response.choices[0]?.message?.content || 'No relevant information found.'
        }
        break

      case 'sql_query':
        const schema = `CallAnalytics view columns: appointmentId, companyId, closerName, contactName, status, outcome, saleAmount, scheduledAt, leadSource, objectionType, objectionNotes, notes, semantic_text, appointmentCashCollected`
        sql = await generateSQL(query, companyId, schema)
        data = await executeSQL(sql, companyId)
        answer = formatQueryResults(data)
        break

      case 'insights':
        answer = await getInsightsAnswer(query, companyId)
        break

      default:
        answer = 'Unable to process query.'
    }

    return {
      intent,
      answer,
      data,
      sql,
      sources
    }
  } catch (error: any) {
    console.error('[AI Query Engine] Error processing query:', error)
    return {
      intent: 'metrics',
      answer: `Error processing query: ${error.message}`
    }
  }
}


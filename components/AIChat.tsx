'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface AIChatProps {
  companyId?: string
}

export function AIChat({ companyId }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    // Create assistant message placeholder
    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }
    setMessages(prev => [...prev, assistantMessage])

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content, stream: false })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()

      // Update assistant message with response
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId
          ? { ...msg, content: data.answer || 'No response' }
          : msg
      ))
    } catch (error: any) {
      console.error('Error:', error)
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId
          ? { ...msg, content: `Error: ${error.message || 'Failed to get response'}` }
          : msg
      ))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader>
        <CardTitle>Ask About Your Sales Data</CardTitle>
        <p className="text-sm text-gray-600">
          Ask questions in plain English about your sales performance, appointments, and metrics.
        </p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              <p className="mb-2">Start a conversation by asking a question!</p>
              <p className="text-sm">Try: "What's my close rate this month?" or "Who had the most appointments last week?"</p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your sales data..."
            className="flex-1 min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}


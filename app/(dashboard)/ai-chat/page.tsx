import { getEffectiveUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AIChat } from '@/components/AIChat'

export default async function AIChatPage() {
  const user = await getEffectiveUser()
  
  if (!user) {
    redirect('/sign-in')
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">AI Sales Assistant</h1>
        <p className="text-gray-600">
          Ask questions about your sales data in plain English. Get instant insights and analytics.
        </p>
      </div>

      <AIChat companyId={user.companyId} />
    </div>
  )
}


'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function OnboardChoicePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-2xl w-full px-4">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src="/revphlo-logo.webp" 
              alt="revphlo" 
              className="h-64 w-auto"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Get Started with revphlo</h1>
          <p className="mt-2 text-gray-600">
            Choose how you'd like to use revphlo
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Company Option */}
          <div className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition border border-gray-200 cursor-pointer"
               onClick={() => router.push('/onboard/company')}>
            <h2 className="text-xl font-semibold mb-2">Set Up My Company</h2>
            <p className="text-gray-600 mb-4">
              I'm the owner or admin setting up revphlo for my business
            </p>
            <ul className="text-sm text-gray-500 space-y-2">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Create your company account
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Configure payment processor
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Set up webhooks
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Invite team members
              </li>
            </ul>
            <Button className="w-full mt-6">Set Up Company</Button>
          </div>

          {/* Join Company Option */}
          <div className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition border border-gray-200 cursor-pointer"
               onClick={() => router.push('/onboard/join')}>
            <h2 className="text-xl font-semibold mb-2">Join My Company</h2>
            <p className="text-gray-600 mb-4">
              I'm a sales rep joining an existing company
            </p>
            <ul className="text-sm text-gray-500 space-y-2">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Enter company invite code
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Get added to the team
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                View your commissions
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Track your appointments
              </li>
            </ul>
            <Button className="w-full mt-6">Join Company</Button>
          </div>
        </div>
      </div>
    </div>
  )
}


'use client'

import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface ImpersonationBannerProps {
  impersonatedUserName: string
  impersonatedUserEmail: string
  companyName: string
}

export default function ImpersonationBanner({
  impersonatedUserName,
  impersonatedUserEmail,
  companyName
}: ImpersonationBannerProps) {
  const router = useRouter()
  
  const exitImpersonation = async () => {
    try {
      const res = await fetch('/api/admin/exit-impersonation', {
        method: 'POST'
      })
      
      if (res.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to exit impersonation:', error)
    }
  }
  
  return (
    <div className="bg-yellow-100 border-b-2 border-yellow-400 px-4 py-2">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-yellow-800 font-semibold">⚠️ Viewing as:</span>
          <span className="font-bold">{impersonatedUserName}</span>
          <span className="text-gray-600">({impersonatedUserEmail})</span>
          <span className="text-gray-600">@ {companyName}</span>
        </div>
        <Button 
          onClick={exitImpersonation}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-1"
        >
          Exit Impersonation
        </Button>
      </div>
    </div>
  )
}


'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Company {
  id: string
  name: string
  email: string
  _count: {
    User: number
    Appointment: number
  }
}

interface CompanySwitcherProps {
  currentCompanyId: string
  currentCompanyName: string | null
  isSuperAdmin: boolean
}

export default function CompanySwitcher({
  currentCompanyId,
  currentCompanyName,
  isSuperAdmin
}: CompanySwitcherProps) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  
  useEffect(() => {
    if (isSuperAdmin) {
      fetch('/api/super-admin/companies')
        .then(res => res.json())
        .then(data => setCompanies(data))
        .catch(console.error)
    }
  }, [isSuperAdmin])
  
  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  const handleSwitch = (companyId: string, companyName: string) => {
    if (companyId === currentCompanyId) {
      setIsOpen(false)
      return
    }
    
    // Build new URL with viewAs param
    const params = new URLSearchParams(searchParams.toString())
    params.set('viewAs', companyId)
    
    setIsOpen(false)
    setSearchQuery('')
    router.push(`?${params.toString()}`)
    router.refresh()
  }
  
  const handleClear = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('viewAs')
    setIsOpen(false)
    setSearchQuery('')
    router.push(`?${params.toString()}`)
    router.refresh()
  }
  
  if (!isSuperAdmin) return null
  
  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className="text-sm"
      >
        {currentCompanyName ? (
          <>
            <span className="text-purple-600">Viewing:</span> {currentCompanyName}
          </>
        ) : (
          'Switch Company'
        )}
      </Button>
      
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border z-20">
            <div className="p-3 border-b">
              <Input
                type="text"
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
                autoFocus
              />
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {/* Current Company */}
              <div
                onClick={handleClear}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-purple-100 bg-purple-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {currentCompanyName || 'My Company'}
                    </p>
                    <p className="text-xs text-gray-500">Current view</p>
                  </div>
                  <span className="text-xs text-purple-600 font-medium">Active</span>
                </div>
              </div>
              
              {/* Company List */}
              {filteredCompanies.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  {searchQuery ? 'No companies found' : 'No companies available'}
                </div>
              ) : (
                filteredCompanies.map((company) => (
                  <div
                    key={company.id}
                    onClick={() => handleSwitch(company.id, company.name)}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b ${
                      company.id === currentCompanyId ? 'bg-purple-50 border-purple-100' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{company.name}</p>
                        <p className="text-xs text-gray-500">
                          {company._count.User} users · {company._count.Appointment} appointments
                        </p>
                      </div>
                      {company.id === currentCompanyId && (
                        <span className="text-xs text-purple-600 font-medium">Active</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">
                Viewing data from another company's perspective
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}


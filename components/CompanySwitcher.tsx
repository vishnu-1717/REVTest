'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Buildings, CaretDown, Check, X } from '@phosphor-icons/react'

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

  const getViewAsCompany = () => {
    const viewAsParam = searchParams.get('viewAs')
    if (viewAsParam) return viewAsParam
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(/(?:^|;)\s*view_as_company=([^;]+)/)
    const value = match ? decodeURIComponent(match[1]) : null
    if (!value || value === 'none') return null
    return value
  }

  const [viewingCompanyId, setViewingCompanyId] = useState<string>(
    getViewAsCompany() || currentCompanyId
  )

  useEffect(() => {
    setViewingCompanyId(getViewAsCompany() || currentCompanyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, currentCompanyId])

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

  const viewingCompany = companies.find(c => c.id === viewingCompanyId)
  const viewingCompanyName = viewingCompany?.name || currentCompanyName || 'My Company'

  const setViewAsCookie = (companyId: string | null) => {
    if (typeof document === 'undefined') return
    if (companyId) {
      document.cookie = `view_as_company=${companyId}; path=/; max-age=${60 * 60 * 12}`
    } else {
      document.cookie = `view_as_company=none; path=/; max-age=${60 * 60 * 12}`
    }
  }

  const handleSwitch = (companyId: string, companyName: string) => {
    if (companyId === currentCompanyId) {
      setIsOpen(false)
      return
    }

    setIsOpen(false)
    setSearchQuery('')
    setViewAsCookie(companyId)
    setViewingCompanyId(companyId)

    const currentPath = window.location.pathname
    const params = new URLSearchParams(window.location.search)
    params.set('viewAs', companyId)

    const newUrl = `${currentPath}?${params.toString()}`
    window.location.href = newUrl
  }

  const handleClear = () => {
    setIsOpen(false)
    setSearchQuery('')
    setViewAsCookie(null)
    setViewingCompanyId(currentCompanyId)

    const currentPath = window.location.pathname
    const params = new URLSearchParams(window.location.search)
    params.delete('viewAs')

    const newUrl = params.toString()
      ? `${currentPath}?${params.toString()}`
      : currentPath

    window.location.href = newUrl
  }

  if (!isSuperAdmin) return null

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className="text-xs h-8 border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium shadow-sm transition-all"
      >
        <Buildings className="w-4 h-4 mr-1.5 opacity-60" />
        {viewingCompanyId !== currentCompanyId ? (
          <span className="flex items-center">
            <span className="text-indigo-600 font-semibold mr-1">Perspective:</span>
            {viewingCompanyName}
          </span>
        ) : (
          'Switch Company'
        )}
        <CaretDown className={`ml-1.5 h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
              {viewingCompanyId !== currentCompanyId && (
                <div
                  onClick={handleClear}
                  className="px-4 py-3 hover:bg-indigo-50/50 cursor-pointer border-b border-indigo-100 bg-indigo-50/30 group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 group-hover:text-indigo-700 transition-colors">
                        Primary View
                      </p>
                      <p className="text-[10px] text-gray-500">Reset to your original perspective</p>
                    </div>
                    <X className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600" />
                  </div>
                </div>
              )}

              {filteredCompanies.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  {searchQuery ? 'No companies found' : 'No companies available'}
                </div>
              ) : (
                filteredCompanies.map((company) => (
                  <div
                    key={company.id}
                    onClick={() => handleSwitch(company.id, company.name)}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b transition-colors group ${company.id === viewingCompanyId ? 'bg-indigo-50/30 border-indigo-100' : ''
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-medium text-sm transition-colors ${company.id === viewingCompanyId ? 'text-indigo-700' : 'text-gray-900 group-hover:text-indigo-600'}`}>{company.name}</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tight">
                          {company._count.User} users · {company._count.Appointment} appointments
                        </p>
                      </div>
                      {company.id === viewingCompanyId && (
                        <Check className="w-4 h-4 text-indigo-600" />
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


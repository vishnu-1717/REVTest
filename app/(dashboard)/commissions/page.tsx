'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Commission {
  id: string
  totalAmount: number
  releasedAmount: number
  percentage: number
  releaseStatus: string
  status: string
  createdAt: string
  sale: {
    amount: number
    customerName: string | null
    paidAt: string | null
  }
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  
  useEffect(() => {
    fetchCommissions()
  }, [])
  
  const fetchCommissions = async () => {
    try {
      const res = await fetch('/api/rep/stats')
      const data = await res.json()
      setCommissions(data.recentCommissions || [])
      
      // Fetch all commissions (not just recent)
      // TODO: Create a separate endpoint for this
      
    } catch (error) {
      console.error('Failed to fetch commissions:', error)
    }
    setLoading(false)
  }
  
  const filteredCommissions = commissions.filter(com => {
    if (filter === 'all') return true
    return com.releaseStatus === filter
  })
  
  const totalEarned = commissions.reduce((sum, com) => sum + com.totalAmount, 0)
  const pending = commissions
    .filter(c => c.releaseStatus === 'pending' || c.releaseStatus === 'partial')
    .reduce((sum, com) => sum + (com.totalAmount - com.releasedAmount), 0)
  const released = commissions
    .filter(c => c.releaseStatus === 'released')
    .reduce((sum, com) => sum + com.releasedAmount, 0)
  const paid = commissions
    .filter(c => c.releaseStatus === 'paid')
    .reduce((sum, com) => sum + com.totalAmount, 0)
  
  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>
  }
  
  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">My Commissions</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Earned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${totalEarned.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-yellow-700">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              ${pending.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-blue-700">
              Released
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              ${released.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-green-700">
              Paid Out
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              ${paid.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Filter Tabs */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({commissions.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-md ${
                filter === 'pending'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('released')}
              className={`px-4 py-2 rounded-md ${
                filter === 'released'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Released
            </button>
            <button
              onClick={() => setFilter('paid')}
              className={`px-4 py-2 rounded-md ${
                filter === 'paid'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Paid
            </button>
          </div>
        </CardContent>
      </Card>
      
      {/* Commissions List */}
      <Card>
        <CardHeader>
          <CardTitle>Commission History</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCommissions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No commissions found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Sale Amount
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Rate
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Commission
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCommissions.map((commission) => (
                    <tr key={commission.id}>
                      <td className="px-4 py-4 text-sm">
                        {new Date(commission.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {commission.sale.customerName || 'Unknown'}
                      </td>
                      <td className="px-4 py-4 text-sm text-right">
                        ${commission.sale.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-sm text-right">
                        {(commission.percentage * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-4 text-sm text-right font-semibold">
                        ${commission.totalAmount.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          commission.releaseStatus === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : commission.releaseStatus === 'released'
                            ? 'bg-blue-100 text-blue-800'
                            : commission.releaseStatus === 'partial'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {commission.releaseStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

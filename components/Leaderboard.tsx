'use client'

import { useState, useEffect } from 'react'

interface LeaderboardEntry {
  id: string
  name: string
  email: string
  rank: number
  appointments: number
  signed: number
  revenue: number
  commissions: number
  showDetails: boolean
  isCurrentUser: boolean
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('30')
  
  useEffect(() => {
    fetchLeaderboard()
  }, [dateRange])
  
  const fetchLeaderboard = async () => {
    try {
      const dateFrom = new Date()
      dateFrom.setDate(dateFrom.getDate() - parseInt(dateRange))
      
      const params = new URLSearchParams({
        dateFrom: dateFrom.toISOString()
      })
      
      const res = await fetch(`/api/rep/leaderboard?${params}`)
      
      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.error)
        setLoading(false)
        return
      }
      
      const data = await res.json()
      setLeaderboard(data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
      setError('Failed to load leaderboard')
    }
    setLoading(false)
  }
  
  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="py-8 text-center text-gray-700">
          {error}
        </div>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="py-8 text-center text-gray-700">
          Loading leaderboard...
        </div>
      </div>
    )
  }
  
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">🏆 Team Leaderboard</h2>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>
      <div>
        {leaderboard.length === 0 ? (
          <p className="text-gray-700 text-sm text-center py-4">
            No data available for this period
          </p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center p-4 rounded-lg border ${
                  entry.isCurrentUser
                    ? 'bg-blue-50 border-blue-300'
                    : index % 2 === 0 
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-transparent border-gray-200'
                }`}
              >
                {/* Rank */}
                <div className="w-12 text-center">
                  <span className={`text-2xl font-bold ${
                    entry.rank === 1 
                      ? 'text-amber-600'
                      : entry.rank === 2
                      ? 'text-gray-700'
                      : entry.rank === 3
                      ? 'text-orange-600'
                      : 'text-gray-600'
                  }`}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                  </span>
                </div>
                
                {/* Name */}
                <div className="flex-1 ml-4">
                  <p className="font-semibold text-gray-900">
                    {entry.name}
                    {entry.isCurrentUser && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md border border-blue-300">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{entry.email}</p>
                </div>
                
                {/* Stats */}
                <div className="flex gap-8 text-center">
                  {entry.showDetails ? (
                    <>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Appointments</p>
                        <p className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {entry.appointments}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Closed</p>
                        <p className="text-lg font-bold text-emerald-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {entry.signed}
                        </p>
                      </div>
                    </>
                  ) : null}
                  
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Revenue</p>
                    <p className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${entry.revenue.toLocaleString()}
                    </p>
                  </div>
                  
                  {entry.showDetails && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Commissions</p>
                      <p className="text-lg font-bold text-blue-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${entry.commissions.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

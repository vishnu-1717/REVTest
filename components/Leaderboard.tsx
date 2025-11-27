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
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
        <div className="py-8 text-center text-slate-300">
          {error}
        </div>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
        <div className="py-8 text-center text-slate-300">
          Loading leaderboard...
        </div>
      </div>
    )
  }
  
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">🏆 Team Leaderboard</h2>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>
      <div>
        {leaderboard.length === 0 ? (
          <p className="text-slate-300 text-sm text-center py-4">
            No data available for this period
          </p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center p-4 rounded-lg border ${
                  entry.isCurrentUser
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : index % 2 === 0 
                    ? 'bg-slate-900/30 border-slate-700/30'
                    : 'bg-transparent border-slate-700/30'
                }`}
              >
                {/* Rank */}
                <div className="w-12 text-center">
                  <span className={`text-2xl font-bold ${
                    entry.rank === 1 
                      ? 'text-amber-300'
                      : entry.rank === 2
                      ? 'text-slate-300'
                      : entry.rank === 3
                      ? 'text-orange-300'
                      : 'text-slate-400'
                  }`}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                  </span>
                </div>
                
                {/* Name */}
                <div className="flex-1 ml-4">
                  <p className="font-semibold text-slate-100">
                    {entry.name}
                    {entry.isCurrentUser && (
                      <span className="ml-2 text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-md border border-blue-500/30">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{entry.email}</p>
                </div>
                
                {/* Stats */}
                <div className="flex gap-8 text-center">
                  {entry.showDetails ? (
                    <>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Appointments</p>
                        <p className="text-lg font-bold text-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {entry.appointments}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Closed</p>
                        <p className="text-lg font-bold text-emerald-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {entry.signed}
                        </p>
                      </div>
                    </>
                  ) : null}
                  
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Revenue</p>
                    <p className="text-lg font-bold text-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${entry.revenue.toLocaleString()}
                    </p>
                  </div>
                  
                  {entry.showDetails && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Commissions</p>
                      <p className="text-lg font-bold text-blue-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
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

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          {error}
        </CardContent>
      </Card>
    )
  }
  
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Loading leaderboard...
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>🏆 Team Leaderboard</CardTitle>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {leaderboard.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            No data available for this period
          </p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center p-4 rounded-lg ${
                  entry.isCurrentUser
                    ? 'bg-blue-50 border-2 border-blue-200'
                    : 'bg-gray-50'
                }`}
              >
                {/* Rank */}
                <div className="w-12 text-center">
                  <span className={`text-2xl font-bold ${
                    entry.rank === 1 
                      ? 'text-yellow-500'
                      : entry.rank === 2
                      ? 'text-gray-400'
                      : entry.rank === 3
                      ? 'text-orange-600'
                      : 'text-gray-600'
                  }`}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                  </span>
                </div>
                
                {/* Name */}
                <div className="flex-1 ml-4">
                  <p className="font-semibold">
                    {entry.name}
                    {entry.isCurrentUser && (
                      <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-1 rounded">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{entry.email}</p>
                </div>
                
                {/* Stats */}
                <div className="flex gap-8 text-center">
                  {entry.showDetails ? (
                    <>
                      <div>
                        <p className="text-sm text-gray-500">Appointments</p>
                        <p className="text-lg font-bold">{entry.appointments}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Closed</p>
                        <p className="text-lg font-bold text-green-600">{entry.signed}</p>
                      </div>
                    </>
                  ) : null}
                  
                  <div>
                    <p className="text-sm text-gray-500">Revenue</p>
                    <p className="text-lg font-bold">
                      ${entry.revenue.toLocaleString()}
                    </p>
                  </div>
                  
                  {entry.showDetails && (
                    <div>
                      <p className="text-sm text-gray-500">Commissions</p>
                      <p className="text-lg font-bold text-blue-600">
                        ${entry.commissions.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface LeaderboardEntry {
  repName: string
  totalRevenue: number
  rank: number
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/rep/leaderboard')
      .then(res => res.json())
      .then(data => {
        setLeaderboard(data)
        setLoading(false)
      })
  }, [])
  
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Team Leaderboard</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Cash Collected Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((entry, idx) => (
                <div key={idx} className="flex justify-between items-center py-3 border-b">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-gray-400">
                      #{entry.rank}
                    </span>
                    <span className="font-medium">{entry.repName}</span>
                  </div>
                  <span className="text-lg font-semibold text-green-600">
                    ${entry.totalRevenue.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


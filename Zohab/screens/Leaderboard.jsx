'use client'

// Top 20 players by wins: a podium for the top 3, then the list.
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Avatar, Empty, Header, Spinner } from '@/components/ui'
import { useSession } from '@/lib/lib'

// [place, bar colour, bar height, avatar size] — drawn in the order 2nd, 1st, 3rd.
const PODIUM = [
  [2, '#C9D1E8', 66, 52],
  [1, '#FFC93C', 90, 66],
  [3, '#E39A5B', 50, 52],
]

function Leaderboard() {
  const { user } = useSession()
  const [players, setPlayers] = useState(null)

  useEffect(() => {
    api('/users/leaderboard').then(setPlayers).catch(() => setPlayers([]))
  }, [])

  return (
    <>
      <Header title="Leaderboard" sub="Most wins" back="/" />
      <div className="scroll">
        {!players && <Spinner />}
        {players?.length === 0 && <Empty emoji="🏅">No games played yet.</Empty>}
        {players?.length > 0 && (
          <div className="podium">
            {PODIUM.map(([place, color, height, size]) => {
              const p = players[place - 1]
              return (
                <div key={place} className="podium-col">
                  {p && (
                    <>
                      <div className="crown">{place === 1 ? '👑' : ' '}</div>
                      <Avatar player={p} size={size} ring={color} />
                      <b className="podium-name">{p.display_name}</b>
                      <div className="podium-bar" style={{ height, background: color }}>
                        <b>{place}</b>
                        <span>{p.games_won} wins</span>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {players?.map((p, i) => (
          <div key={p.player_id} className={`rank-row${p.player_id === user.player_id ? ' me' : ''}`}>
            <b className="rank">{i + 1}</b>
            <Avatar player={p} size={32} />
            <div className="grow">
              <div className="nm">{p.display_name}</div>
              <div className="small">
                @{p.username} · {p.games_played} played
              </div>
            </div>
            <b className="wins">{p.games_won}</b>
          </div>
        ))}
      </div>
    </>
  )
}

export default Leaderboard

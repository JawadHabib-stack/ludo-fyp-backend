'use client'

// Home: greeting + invitations bell, next tournament match, Play Online and the game modes.
import { useEffect, useLayoutEffect, useState } from 'react'
import { api, listen } from '@/lib/api'
import { Avatar, Icon, Pawn, Sheet } from '@/components/ui'
import { formatCountdown, useGo, useNow, useSession } from '@/lib/lib'

const QUEUES = [
  ['ffa2', 'swords', '1 vs 1', '2 players, classic rules'],
  ['ffa4', 'globe', '4 Players', 'Everyone for themselves'],
  ['2v2', 'users', '2 vs 2 Teams', 'Play with a partner'],
]

const MODES = [
  ['/play/bot', 'vs Computer', 'Practice with bots', 'bot', ['#4BDA88', '#14994C']],
  ['/tournaments', 'Tournaments', 'Knockout cups', 'trophy', ['#FFD95A', '#E6A800']],
  ['/play/create-room', 'Create Room', 'Play with friends', 'users', ['#5FA0FF', '#1E64D6']],
  ['/play/join', 'Join Room', 'Enter a room code', 'key', ['#FF6B7A', '#D9263A']],
]

function Home() {
  const { user } = useSession()
  const go = useGo()
  const registered = user.player_type === 'registered'
  const now = useNow()
  const [online, setOnline] = useState(false)
  const [invites, setInvites] = useState(0)
  const [next, setNext] = useState(null) // my next tournament match

  // Next.js keeps visited pages alive (hidden). Close the sheet when this page is hidden.
  useLayoutEffect(() => () => setOnline(false), [])

  useEffect(() => {
    if (!registered) return
    const load = () => {
      Promise.all([api('/rooms/invitations'), api('/tournaments/invitations')])
        .then(([rooms, cups]) => setInvites(rooms.length + cups.length))
        .catch(() => {})
      api('/tournaments/my-matches')
        .then((list) => setNext(list.find((m) => m.status === 'in_progress') || list[0] || null))
        .catch(() => {})
    }
    load()
    return listen({
      'invite:received': load,
      'tournament:invited': load,
      'tournament:match_ready': load,
      'tournament:match_started': load,
      'tournament:updated': load,
    })
  }, [registered])

  const startsIn = next ? new Date(next.scheduled_at) - now : 0

  return (
    <div className="scroll pt">
      <div className="row hello">
        <Avatar player={user} size={44} ring="var(--gold)" />
        <div className="grow">
          <div className="dim xs">Hello,</div>
          <b className="hello-name">{user.display_name}</b>
        </div>
        {registered && (
          <button type="button" className="bell" aria-label={`Invitations (${invites})`} onClick={() => go('/invites')}>
            <Icon name="bell" size={21} />
            {invites > 0 && <span className="count">{invites}</span>}
          </button>
        )}
      </div>

      {next && (
        <button type="button" className="glass hl-gold next-match" onClick={() => go(`/match/${next.match_id}`)}>
          <span className="gold-label">
            🏆 {next.tournament_name} · Round {next.round_no}
          </span>
          <b>
            {next.status === 'in_progress'
              ? 'Your match is live — join now!'
              : startsIn > 0
                ? `Your match starts in ${formatCountdown(startsIn)}`
                : 'Your match is starting…'}
          </b>
          <span className="small">Join the lobby early: it starts as soon as everyone is there.</span>
        </button>
      )}

      <button type="button" className="hero" onClick={() => setOnline(true)}>
        <span className="hero-pawns">
          {['red', 'green', 'yellow', 'blue'].map((c) => (
            <Pawn key={c} color={c} size={40} />
          ))}
        </span>
        <span className="hero-title">PLAY ONLINE</span>
        <span className="hero-sub">Get matched with real players in seconds</span>
        <span className="hero-btn">PLAY NOW</span>
      </button>

      <div className="sec">Game modes</div>
      <div className="tiles">
        {MODES.map(([path, title, sub, icon, [from, to]]) => (
          <button key={path} type="button" className="tile" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} onClick={() => go(path)}>
            <span className="ti">
              <Icon name={icon} size={24} sw={2.4} />
            </span>
            <b>{title}</b>
            <span>{sub}</span>
          </button>
        ))}
      </div>

      <button type="button" className="glass row link-row" onClick={() => go('/leaderboard')}>
        <span className="em">🏅</span>
        <div className="grow">
          <b>Leaderboard</b>
          <div className="small">Top players by wins</div>
        </div>
        <Icon name="chevronRight" size={22} color="var(--dim)" />
      </button>

      {online && (
        <Sheet title="Play Online" onClose={() => setOnline(false)}>
          {QUEUES.map(([key, icon, title, sub]) => (
            <button key={key} type="button" className="glass row option" onClick={() => go(`/play/queue/${key}`)}>
              <Icon name={icon} size={26} color="var(--gold)" />
              <div className="grow">
                <b>{title}</b>
                <div className="small">{sub}</div>
              </div>
              <Icon name="chevronRight" size={22} color="var(--dim)" />
            </button>
          ))}
        </Sheet>
      )}
    </div>
  )
}

export default Home

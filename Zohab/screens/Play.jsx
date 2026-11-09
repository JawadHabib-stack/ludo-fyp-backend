'use client'

// Starting a game: vs Computer setup, create a room, join a room by code, and online matchmaking.
import { useEffect, useState } from 'react'
import { api, emit, listen } from '@/lib/api'
import { Btn, Chips, Header, Pawn } from '@/components/ui'
import { ruleOptions, useGo, useNow, useRuleSets, useSession } from '@/lib/lib'

const PLAYERS = [[2, '2'], [3, '3'], [4, '4']]
const MODES = [['ffa', 'Free for all'], ['2v2', '2 vs 2']]

export function BotSetup() {
  const go = useGo()
  const rules = useRuleSets()
  const [f, setF] = useState({ total_players: 4, game_mode: 'ffa', difficulty: 'easy', rule_set_id: 1 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (field) => (value) => setF({ ...f, [field]: value })

  function start() {
    setError('')
    setBusy(true)
    api('/matches/bot', 'POST', { ...f, game_mode: f.total_players === 4 ? f.game_mode : 'ffa' })
      .then((d) => go(`/match/${d.match_id}`))
      .catch((err) => {
        setError(err.message)
        setBusy(false)
      })
  }

  return (
    <>
      <Header title="vs Computer" sub="You are red. Bots take the other seats." back="/" />
      <div className="scroll">
        <div className="glass">
          <Chips label="Players" value={f.total_players} options={PLAYERS} onChange={set('total_players')} />
          {f.total_players === 4 && <Chips label="Mode" value={f.game_mode} options={MODES} onChange={set('game_mode')} />}
          <Chips label="Bot difficulty" value={f.difficulty} options={[['easy', '😊 Easy'], ['hard', '😈 Hard']]} onChange={set('difficulty')} />
          <Chips label="Rules" value={f.rule_set_id} options={ruleOptions(rules)} onChange={set('rule_set_id')} />
          {rules.some((r) => r.name === 'Demo') && <p className="small tip">Tip: &quot;Demo&quot; rules finish fast — only 1 token needs to reach home.</p>}
          {error && <p className="error">{error}</p>}
          <Btn v="gold" icon="play" onClick={start} disabled={busy}>
            Start Game
          </Btn>
        </div>
      </div>
    </>
  )
}

export function CreateRoom() {
  const { user } = useSession()
  const go = useGo()
  const rules = useRuleSets()
  const [f, setF] = useState({ max_players: 4, game_mode: 'ffa', rule_set_id: 1 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (field) => (value) => setF({ ...f, [field]: value })

  function create() {
    setError('')
    setBusy(true)
    api('/rooms', 'POST', { ...f, game_mode: f.max_players === 4 ? f.game_mode : 'ffa' })
      .then((d) => go(`/match/${d.match_id}`))
      .catch((err) => {
        setError(err.message)
        setBusy(false)
      })
  }

  return (
    <>
      <Header title="Create Room" sub="Invite friends or share the code" back="/" />
      <div className="scroll">
        {user.player_type !== 'registered' ? (
          <div className="glass center">
            <div className="big-emoji">🔒</div>
            <b>Rooms need an account</b>
            <p className="dim mt6">Guests can still join a friend&apos;s room with its code.</p>
            <div className="gap16" />
            <Btn v="gold" icon="key" onClick={() => go('/play/join')}>
              Join Room
            </Btn>
          </div>
        ) : (
          <div className="glass">
            <Chips label="Seats" value={f.max_players} options={PLAYERS} onChange={set('max_players')} />
            {f.max_players === 4 && <Chips label="Mode" value={f.game_mode} options={MODES} onChange={set('game_mode')} />}
            <Chips label="Rules" value={f.rule_set_id} options={ruleOptions(rules)} onChange={set('rule_set_id')} />
            {error && <p className="error">{error}</p>}
            <Btn v="gold" icon="door" onClick={create} disabled={busy}>
              Create Room
            </Btn>
          </div>
        )}
      </div>
    </>
  )
}

export function JoinRoom() {
  const go = useGo()
  const [code, setCode] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function join(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    api('/rooms/join', 'POST', { room_code: code })
      .then((d) => go(`/match/${d.match_id}`))
      .catch((err) => {
        setError(err.message)
        setBusy(false)
      })
  }

  return (
    <>
      <Header title="Join Room" sub="Ask the host for the room code" back="/" />
      <div className="scroll">
        <form className="glass" onSubmit={join}>
          <div className="lbl">Room code</div>
          <label className="codeboxes">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`codebox${focused && i === Math.min(code.length, 5) ? ' on' : ''}`}>
                {code[i] || ''}
              </span>
            ))}
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Room code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <Btn type="submit" v="gold" icon="logIn" disabled={code.length !== 6 || busy}>
            Join
          </Btn>
        </form>
      </div>
    </>
  )
}

const QUEUE_INFO = { ffa2: ['1 VS 1', 2], ffa4: ['4 PLAYERS', 4], '2v2': ['2 VS 2 TEAMS', 4] }

// Waits in the online queue. The app opens the board when the server sends queue:matched.
export function Matchmaking({ queueKey }) {
  const go = useGo()
  const [label, needed] = QUEUE_INFO[queueKey] || ['ONLINE', 2]
  const [waiting, setWaiting] = useState(1)
  const [error, setError] = useState('')
  const [startedAt] = useState(() => Date.now())
  const now = useNow(1000)

  useEffect(() => {
    if (!QUEUE_INFO[queueKey]) return
    const stop = listen({ 'queue:waiting': (d) => d.queue_key === queueKey && setWaiting(d.waiting) })
    emit('queue:join', { queue_key: queueKey })
      .then((d) => d.matched && go(`/match/${d.match_id}`))
      .catch((err) => setError(err.message))
    return () => {
      stop()
      emit('queue:leave').catch(() => {}) // leaving this screen also leaves the queue
    }
  }, [queueKey, go])

  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))

  return (
    <>
      <div className="matchmaking">
        <div className="mm-label">{label}</div>
        <div className="mm-title">Finding players…</div>
        <div className="orbit">
          <div className="orbit-ring">
            {['red', 'green', 'yellow', 'blue'].map((c, i) => (
              <span key={c} className={`orbit-pawn p${i}`}>
                <Pawn color={c} size={54} />
              </span>
            ))}
          </div>
          <div className="orbit-core">
            <b>
              {waiting}/{needed}
            </b>
            <span className="dim">players</span>
          </div>
        </div>
        <div className="mm-time">
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </div>
        <div className="small">Waiting for other players to join this queue.</div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="bottom-actions">
        <Btn v="ghost" icon="x" onClick={() => go('/')}>
          Cancel
        </Btn>
      </div>
    </>
  )
}

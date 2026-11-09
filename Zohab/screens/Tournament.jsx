'use client'

// One tournament: my next match, info, join / leave / invite, the creator's controls, players and the bracket.
import { useEffect, useLayoutEffect, useState } from 'react'
import { api, listen } from '@/lib/api'
import InviteSheet from '@/components/InviteSheet'
import { Avatar, Btn, Header, Icon, Pill, Spinner } from '@/components/ui'
import { formatCountdown, formatWhen, LUDO, useGo, useNow, useSession } from '@/lib/lib'
import { TournamentForm } from './Tournaments'

function Tournament({ id }) {
  const { user } = useSession()
  const go = useGo()
  const registered = user.player_type === 'registered'
  const now = useNow()
  const [data, setData] = useState(null) // { tournament, participants, rounds, champion }
  const [friends, setFriends] = useState([])
  const [times, setTimes] = useState({}) // new start times typed by the creator, per match
  const [editing, setEditing] = useState(false)
  const [inviting, setInviting] = useState(false)

  // Next.js keeps visited pages alive (hidden). Close the form / sheet when this page is hidden.
  useLayoutEffect(
    () => () => {
      setEditing(false)
      setInviting(false)
    },
    []
  )
  const [message, setMessage] = useState('')

  useEffect(() => {
    const load = () => api(`/tournaments/${id}`).then(setData).catch((err) => setMessage(err.message))
    load()
    if (registered) api('/friends').then(setFriends).catch(() => {})
    return listen({ 'tournament:updated': (e) => e.tournament_id === id && load() })
  }, [id, registered])

  const reload = () => api(`/tournaments/${id}`).then(setData)

  // Runs a request, shows its error (or okText), then reloads the tournament.
  function act(request, okText = '') {
    setMessage('')
    request
      .then(() => {
        setMessage(okText)
        reload()
      })
      .catch((err) => setMessage(err.message))
  }

  if (!data) {
    return (
      <>
        <Header title="Tournament" back="/tournaments" />
        <div className="scroll center-fill">{message ? <p className="error">{message}</p> : <Spinner />}</div>
      </>
    )
  }

  const { tournament: t, participants, rounds, champion } = data
  const isCreator = t.creator_id === user.player_id
  const joined = participants.some((p) => p.player_id === user.player_id)
  const open = t.status === 'registration'
  const live = t.status === 'in_progress'
  const freeFriends = friends.filter((f) => !participants.some((p) => p.player_id === f.player_id))
  const startsIn = new Date(t.start_time) - now

  // My match that is waiting or being played.
  const myMatch = rounds
    .flatMap((r) => r.matches.map((m) => ({ ...m, round_no: r.round_no })))
    .find((m) => (m.status === 'waiting' || m.status === 'in_progress') && m.seats.some((s) => s.player_id === user.player_id))

  if (editing) {
    return (
      <TournamentForm
        tournament={t}
        onSaved={() => {
          setEditing(false)
          reload()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const info = [
    ['Format', `${t.players_per_match === 2 ? '1 vs 1' : '4 players'} knockout`],
    ['Rules', t.rule_set_name],
    ['Players', `${t.participant_count} / ${t.max_participants}`],
    ['Starts', formatWhen(t.start_time)],
    open && startsIn > 0 && ['Countdown', formatCountdown(startsIn)],
    live && ['Round', `Round ${t.current_round}`],
    ['Break between rounds', `${t.round_break_minutes} min`],
  ].filter(Boolean)

  return (
    <>
      <Header title={t.name} sub={`by @${t.creator_username}${isCreator ? ' (you)' : ''}`} back="/tournaments" right={<Pill status={t.status} />} />
      <div className="scroll">
        {champion && (
          <div className="glass hl-gold center champion">
            <div className="big-emoji">🏆</div>
            <div className="champion-label">CHAMPION</div>
            <div className="champion-av">
              <Avatar player={champion} size={62} ring="var(--gold)" />
            </div>
            <b className="champion-name">{champion.display_name}</b>
          </div>
        )}

        {myMatch && (
          <div className={`glass ${myMatch.status === 'in_progress' ? 'hl-red' : 'hl-gold'} mb12`}>
            <div className="eyebrow-gold">YOUR MATCH · ROUND {myMatch.round_no}</div>
            <div className="my-match-time">
              {myMatch.status === 'in_progress'
                ? 'Live now!'
                : new Date(myMatch.scheduled_at) > now
                  ? formatCountdown(new Date(myMatch.scheduled_at) - now)
                  : 'Starting…'}
            </div>
            <div className="small">Enter the lobby early: the match starts as soon as everyone is there.</div>
            <div className="gap10" />
            <Btn v="gold" size="md" icon="play" onClick={() => go(`/match/${myMatch.match_id}`)}>
              Play Now
            </Btn>
          </div>
        )}

        <div className="glass">
          {t.description && <div className="desc">{t.description}</div>}
          {info.map(([label, value]) => (
            <div key={label} className="info-row">
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>

        {open && (
          <div className="stack mt12">
            {registered && !joined && (
              <Btn v="gold" size="md" icon="check" onClick={() => act(api(`/tournaments/${id}/register`, 'POST'), 'You joined!')}>
                Join Tournament
              </Btn>
            )}
            {(isCreator || joined) && (
              <Btn size="md" icon="userPlus" onClick={() => setInviting(true)}>
                Invite Friends
              </Btn>
            )}
            {joined && (
              <Btn v="ghost" size="md" icon="logOut" onClick={() => act(api(`/tournaments/${id}/register`, 'DELETE'))}>
                Leave Tournament
              </Btn>
            )}
            {!registered && <p className="small center">Create an account to join tournaments.</p>}
          </div>
        )}

        {message && <p className="notice">{message}</p>}

        {isCreator && (open || live) && (
          <div className="glass mt12">
            <b className="gold-text">👑 Creator controls</b>
            <div className="small mt4 mb10">{open ? 'It starts by itself at the start time, or start it now.' : 'The tournament is running.'}</div>
            {open && (
              <>
                <div className="btn-row">
                  <Btn v="ghost" size="md" icon="edit" onClick={() => setEditing(true)}>
                    Edit
                  </Btn>
                  <Btn v="success" size="md" icon="zap" onClick={() => act(api(`/tournaments/${id}/start`, 'POST'))}>
                    Start now
                  </Btn>
                </div>
                <div className="gap8" />
              </>
            )}
            <Btn v="danger" size="md" icon="xCircle" onClick={() => confirm('Cancel this tournament?') && act(api(`/tournaments/${id}/cancel`, 'POST'))}>
              Cancel Tournament
            </Btn>
          </div>
        )}

        <div className="sec">Players ({participants.length})</div>
        {participants.length === 0 && <p className="dim">No players yet</p>}
        {participants.map((p) => {
          const out = p.status === 'eliminated'
          return (
            <div key={p.player_id} className="list-row">
              <Avatar player={p} size={34} ring={p.status === 'champion' ? 'var(--gold)' : undefined} dim={out} />
              <div className="grow">
                <div className="nm">
                  {p.display_name}
                  {p.player_id === user.player_id ? ' (you)' : ''}
                  {p.player_id === t.creator_id ? ' 👑' : ''}
                </div>
                <div className="un">
                  @{p.username}
                  {out && p.eliminated_round ? ` · out in round ${p.eliminated_round}` : ''}
                </div>
              </div>
              {!open && <Pill status={p.status} />}
              {open && isCreator && p.player_id !== user.player_id && (
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Remove ${p.display_name}`}
                  onClick={() => confirm(`Remove ${p.display_name}?`) && act(api(`/tournaments/${id}/participants/${p.player_id}`, 'DELETE'))}
                >
                  <Icon name="x" size={22} />
                </button>
              )}
            </div>
          )
        })}

        <div className="sec">Bracket</div>
        {rounds.length === 0 && <p className="dim">Matches are drawn when the tournament starts.</p>}
        {rounds.length > 0 && (
          <div className="bracket">
            {rounds.map((round, ri) => (
              <div key={round.round_no} className="bcol">
                <h4>{ri === rounds.length - 1 && round.matches.length === 1 ? 'Final' : `Round ${round.round_no}`}</h4>
                {round.matches.map((m) => {
                  const mine = m.seats.some((s) => s.player_id === user.player_id)
                  const done = m.status === 'finished'
                  return (
                    <div key={m.match_id} className={`glass bmatch${m.status === 'in_progress' ? ' hl-gold' : ''}`}>
                      <div className="row">
                        <b className="grow">Match {m.match_no}</b>
                        <Pill status={m.status} />
                      </div>
                      {m.scheduled_at && (
                        <div className="small row when">
                          <Icon name="clock" size={13} />
                          {formatWhen(m.scheduled_at)}
                        </div>
                      )}
                      {m.seats.map((s) => {
                        const winner = m.winner_id === s.player_id
                        return (
                          <div key={s.seat_no} className={`bseat${winner ? ' win' : done ? ' lost' : ''}`}>
                            <i className="cd" style={{ background: LUDO[s.color].main }} />
                            <span className={`grow${s.player_id === user.player_id ? ' gold-text' : ''}`}>
                              {s.player_id === user.player_id ? 'You' : s.display_name}
                            </span>
                            {winner && <Icon name="crown" size={16} color="var(--gold)" />}
                          </div>
                        )
                      })}
                      {mine && m.status !== 'cancelled' && (
                        <Btn v={done ? 'ghost' : 'gold'} size="sm" icon={done ? 'chevronRight' : 'play'} className="mt8" onClick={() => go(`/match/${m.match_id}`)}>
                          {done ? 'View' : 'Play now'}
                        </Btn>
                      )}
                      {isCreator && m.status === 'waiting' && (
                        <div className="creator-match">
                          <span className="input sm">
                            <input
                              type="datetime-local"
                              value={times[m.match_id] || ''}
                              onChange={(e) => setTimes({ ...times, [m.match_id]: e.target.value })}
                              aria-label={`New time for match ${m.match_no}`}
                            />
                          </span>
                          <div className="btn-row">
                            <Btn
                              v="ghost"
                              size="sm"
                              disabled={!times[m.match_id]}
                              onClick={() => act(api(`/tournaments/${id}/matches/${m.match_id}/schedule`, 'PUT', { scheduled_at: times[m.match_id] }), 'Time changed')}
                            >
                              Set time
                            </Btn>
                            <Btn v="success" size="sm" onClick={() => act(api(`/tournaments/${id}/matches/${m.match_id}/start`, 'POST'))}>
                              Start
                            </Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      {inviting && (
        <InviteSheet
          friends={freeFriends}
          onInvite={(playerId) => api(`/tournaments/${id}/invitations`, 'POST', { receiver_id: playerId })}
          onClose={() => setInviting(false)}
        />
      )}
    </>
  )
}

export default Tournament

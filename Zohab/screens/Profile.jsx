'use client'

// Profile tab: avatar, stats, recent matches, edit profile, leaderboard and log out.
import { useEffect, useLayoutEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Avatar, Btn, Empty, Field, Header, Icon, Sheet } from '@/components/ui'
import { formatWhen, LUDO, useGo, useSession } from '@/lib/lib'

const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🐨', '🐙', '🦄', '🐲', '🤖', '👑']
const TYPES = { bot: 'vs Computer', online: 'Online', room: 'Private Room', tournament: 'Tournament' }
const PLACE = ['1st', '2nd', '3rd', '4th']

function EditProfile({ user, setUser, onClose }) {
  const [name, setName] = useState(user.display_name)
  const [avatar, setAvatar] = useState(user.avatar || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function save(e) {
    e.preventDefault()
    setBusy(true)
    api('/users/me', 'PUT', { display_name: name, avatar: avatar || undefined })
      .then((player) => {
        setUser(player)
        onClose()
      })
      .catch((err) => {
        setError(err.message)
        setBusy(false)
      })
  }

  return (
    <Sheet title="Edit profile" onClose={onClose}>
      <form onSubmit={save}>
        <div className="lbl">Pick an avatar</div>
        <div className="avatar-picker">
          {AVATARS.map((a) => (
            <button type="button" key={a} className={a === avatar ? 'on' : ''} aria-pressed={a === avatar} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>
        <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required />
        {error && <p className="error">{error}</p>}
        <Btn type="submit" v="gold" icon="save" disabled={busy}>
          Save
        </Btn>
      </form>
    </Sheet>
  )
}

function Profile() {
  const { user, setUser, logout: onLogout } = useSession()
  const go = useGo()
  const registered = user.player_type === 'registered'
  const [matches, setMatches] = useState(null)
  const [editing, setEditing] = useState(false)

  // Next.js keeps visited pages alive (hidden). Close the edit sheet when this page is hidden.
  useLayoutEffect(() => () => setEditing(false), [])

  useEffect(() => {
    api('/auth/me').then(setUser).catch(() => {}) // fresh stats
    api('/users/me/matches').then(setMatches).catch(() => setMatches([]))
  }, [setUser])

  const played = user.games_played || 0
  const winRate = played ? Math.round(((user.games_won || 0) / played) * 100) : 0

  return (
    <>
      <Header
        title="Profile"
        right={
          <button type="button" className="icon-btn" aria-label="Log out" onClick={onLogout}>
            <Icon name="logOut" size={22} />
          </button>
        }
      />
      <div className="scroll">
        <div className="glass center">
          <div className="profile-av">
            <Avatar player={user} size={78} ring="var(--gold)" />
          </div>
          <b className="profile-name">{user.display_name}</b>
          <div className="dim">{registered ? `@${user.username}` : 'Guest player'}</div>
          <div className="gap10" />
          <Btn v="ghost" size="sm" icon="edit" onClick={() => setEditing(true)}>
            Edit profile
          </Btn>
        </div>

        {registered && (
          <div className="stats mt12">
            <div>
              <b>{played}</b>
              <span>Played</span>
            </div>
            <div>
              <b>{user.games_won || 0}</b>
              <span>Won</span>
            </div>
            <div>
              <b>{winRate}%</b>
              <span>Win rate</span>
            </div>
            <div>
              <b>{user.tournaments_won || 0}</b>
              <span>🏆 Cups</span>
            </div>
          </div>
        )}

        <div className="sec">Recent matches</div>
        {matches?.length === 0 && <Empty emoji="🎲">No finished matches yet. Go play one!</Empty>}
        {matches?.map((m) => {
          const won = m.finish_position === 1
          return (
            <button key={m.match_id} type="button" className="list-row as-btn" onClick={() => go(`/match/${m.match_id}`)}>
              <i className="cd lg" style={{ background: LUDO[m.color]?.main }} />
              <div className="grow">
                <div className="nm">
                  {TYPES[m.match_type] || 'Match'}
                  {m.game_mode === '2v2' ? ' · 2 vs 2' : ''}
                </div>
                <div className="un">{m.ended_at ? formatWhen(m.ended_at) : ''}</div>
              </div>
              <b className={won ? 'gold-text' : 'dim'}>{won ? '🏆 Won' : PLACE[m.finish_position - 1] || '—'}</b>
            </button>
          )
        })}

        <button type="button" className="glass row link-row mt12" onClick={() => go('/leaderboard')}>
          <span className="em">🏅</span>
          <div className="grow">
            <b>Leaderboard</b>
            <div className="small">See who has the most wins</div>
          </div>
          <Icon name="chevronRight" size={22} color="var(--dim)" />
        </button>
        <div className="gap12" />
        <Btn v="ghost" icon="logOut" onClick={onLogout}>
          Log Out
        </Btn>
      </div>
      {editing && <EditProfile user={user} setUser={setUser} onClose={() => setEditing(false)} />}
    </>
  )
}

export default Profile

'use client'

// Friends tab: my friends, friend requests, and search to add new ones.
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Avatar, Btn, Chips, Empty, Field, Header, Icon } from '@/components/ui'
import { useSession } from '@/lib/lib'
import Home from './Home'

function Person({ p, children }) {
  return (
    <div className="list-row">
      <Avatar player={p} size={38} />
      <div className="grow">
        <div className="nm">{p.display_name}</div>
        <div className="un">@{p.username}</div>
      </div>
      {children}
    </div>
  )
}

function FriendsList() {
  const [tab, setTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ received: [], sent: [] })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [message, setMessage] = useState('')

  const load = useCallback(() => {
    api('/friends').then(setFriends).catch(() => {})
    api('/friends/requests').then(setRequests).catch(() => {})
  }, [])
  useEffect(load, [load])

  // Search as you type (waits a moment after the last key).
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let current = true
    const timer = setTimeout(() => {
      api(`/users/search?q=${encodeURIComponent(q)}`)
        .then((list) => current && setResults(list))
        .catch((err) => current && setMessage(err.message))
    }, 300)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  function act(request, okText = '') {
    setMessage('')
    request
      .then(() => {
        setMessage(okText)
        load()
      })
      .catch((err) => setMessage(err.message))
  }

  const answer = (r, action) => act(api(`/friends/requests/${r.friendship_id}`, 'PUT', { action }))
  const isFriend = (id) => friends.some((f) => f.player_id === id)
  const sentTo = (id) => requests.sent.some((r) => r.player_id === id)
  const receivedFrom = (id) => requests.received.find((r) => r.player_id === id)

  return (
    <>
      <Header title="Friends" />
      <div className="tabs">
        <Chips
          value={tab}
          options={[
            ['friends', `Friends (${friends.length})`],
            ['requests', `Requests${requests.received.length ? ` (${requests.received.length})` : ''}`],
            ['add', 'Add'],
          ]}
          onChange={(v) => {
            setMessage('')
            setTab(v)
          }}
        />
      </div>
      <div className="scroll">
        {message && <p className="notice">{message}</p>}

        {tab === 'friends' &&
          (friends.length === 0 ? (
            <Empty emoji="🤝">No friends yet. Open the Add tab to find players.</Empty>
          ) : (
            friends.map((f) => (
              <Person key={f.player_id} p={f}>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${f.display_name}`}
                  onClick={() => confirm(`Remove ${f.display_name} from your friends?`) && act(api(`/friends/${f.player_id}`, 'DELETE'))}
                >
                  <Icon name="userMinus" size={22} />
                </button>
              </Person>
            ))
          ))}

        {tab === 'requests' && (
          <>
            <div className="sec first">Received</div>
            {requests.received.length === 0 && <p className="dim">No new requests.</p>}
            {requests.received.map((r) => (
              <Person key={r.friendship_id} p={r}>
                <button type="button" className="circle-btn red" aria-label="Reject" onClick={() => answer(r, 'reject')}>
                  <Icon name="x" size={18} />
                </button>
                <button type="button" className="circle-btn green" aria-label="Accept" onClick={() => answer(r, 'accept')}>
                  <Icon name="check" size={18} />
                </button>
              </Person>
            ))}
            <div className="sec">Sent</div>
            {requests.sent.length === 0 && <p className="dim">No pending requests.</p>}
            {requests.sent.map((r) => (
              <Person key={r.friendship_id} p={r}>
                <b className="muted">Pending</b>
              </Person>
            ))}
          </>
        )}

        {tab === 'add' && (
          <>
            <Field
              icon="search"
              placeholder="Search by username"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (!e.target.value.trim()) setResults(null)
              }}
              aria-label="Search by username"
              autoFocus
            />
            {results?.length === 0 && <p className="dim">No players found.</p>}
            {results?.map((p) => {
              const request = receivedFrom(p.player_id)
              return (
                <Person key={p.player_id} p={p}>
                  {isFriend(p.player_id) ? (
                    <b className="muted">Friends</b>
                  ) : sentTo(p.player_id) ? (
                    <b className="muted">Requested</b>
                  ) : request ? (
                    <Btn v="success" size="sm" icon="check" onClick={() => answer(request, 'accept')}>
                      Accept
                    </Btn>
                  ) : (
                    <Btn v="gold" size="sm" icon="userPlus" onClick={() => act(api('/friends/requests', 'POST', { username: p.username }), 'Request sent')}>
                      Add
                    </Btn>
                  )}
                </Person>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}

// Guests have no friends list: they see Home instead (same as the tab being hidden for them).
export default function Friends() {
  const { user } = useSession()
  return user.player_type === 'registered' ? <FriendsList /> : <Home />
}

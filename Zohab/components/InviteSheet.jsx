'use client'

// "Invite friends" sheet, used by room lobbies and tournaments. onInvite(playerId) returns a promise.
import { useState } from 'react'
import { useGo } from '@/lib/lib'
import { Avatar, Btn, Sheet } from './ui.jsx'

function InviteSheet({ friends, onInvite, onClose }) {
  const go = useGo()
  const [sent, setSent] = useState([])
  const [error, setError] = useState('')

  function invite(friend) {
    setError('')
    onInvite(friend.player_id)
      .then(() => setSent((ids) => [...ids, friend.player_id]))
      .catch((err) => setError(err.message))
  }

  return (
    <Sheet title="Invite friends" onClose={onClose}>
      {friends.length === 0 ? (
        <>
          <p className="dim">No friends to invite yet.</p>
          <div className="gap12" />
          <Btn v="ghost" size="md" icon="userPlus" onClick={() => go('/friends')}>
            Find friends
          </Btn>
        </>
      ) : (
        <div className="sheet-list">
          {friends.map((f) => (
            <div key={f.player_id} className="list-row">
              <Avatar player={f} size={36} />
              <div className="grow">
                <div className="nm">{f.display_name}</div>
                <div className="un">@{f.username}</div>
              </div>
              {sent.includes(f.player_id) ? (
                <Btn v="success" size="sm" disabled>
                  Invited ✓
                </Btn>
              ) : (
                <Btn v="gold" size="sm" onClick={() => invite(f)}>
                  Invite
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </Sheet>
  )
}

export default InviteSheet

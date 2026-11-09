'use client'

// Tournament and room invitations: join or decline.
import { useEffect, useState } from 'react'
import { api, listen } from '@/lib/api'
import { Btn, Empty, Header, Spinner } from '@/components/ui'
import { formatWhen, useGo } from '@/lib/lib'

function Invitations() {
  const go = useGo()
  const [rooms, setRooms] = useState(null)
  const [cups, setCups] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => {
      api('/rooms/invitations').then(setRooms).catch(() => setRooms([]))
      api('/tournaments/invitations').then(setCups).catch(() => setCups([]))
    }
    load()
    return listen({ 'invite:received': load, 'tournament:invited': load })
  }, [])

  const fail = (err) => setError(err.message)

  function answerCup(inv, action) {
    setError('')
    api(`/tournaments/invitations/${inv.invitation_id}`, 'PUT', { action })
      .then(() => (action === 'accept' ? go(`/tournaments/${inv.tournament_id}`) : setCups((list) => list.filter((i) => i !== inv))))
      .catch(fail)
  }

  function answerRoom(inv, action) {
    setError('')
    api(`/rooms/invitations/${inv.invitation_id}`, 'PUT', { action })
      .then((d) => (action === 'accept' ? go(`/match/${d.match_id}`) : setRooms((list) => list.filter((i) => i !== inv))))
      .catch(fail)
  }

  const loading = rooms === null || cups === null

  return (
    <>
      <Header title="Invitations" back="/" />
      <div className="scroll">
        {error && <p className="error">{error}</p>}
        {loading && <Spinner />}
        {!loading && rooms.length === 0 && cups.length === 0 && <Empty emoji="📭">No invitations right now. When a friend invites you, it shows up here.</Empty>}

        {cups?.length > 0 && <div className="sec first">Tournaments</div>}
        {cups?.map((inv) => (
          <div key={inv.invitation_id} className="glass hl-gold mb12">
            <b className="card-title">🏆 {inv.tournament_name}</b>
            <div className="dim mt4">{inv.sender_display_name} invited you</div>
            {inv.start_time && <div className="dim">Starts {formatWhen(inv.start_time)}</div>}
            <div className="btn-row mt12">
              <Btn v="ghost" size="md" icon="x" onClick={() => answerCup(inv, 'decline')}>
                Decline
              </Btn>
              <Btn v="gold" size="md" icon="check" onClick={() => answerCup(inv, 'accept')}>
                Join
              </Btn>
            </div>
          </div>
        ))}

        {rooms?.length > 0 && <div className={`sec${cups?.length ? '' : ' first'}`}>Rooms</div>}
        {rooms?.map((inv) => (
          <div key={inv.invitation_id} className="glass mb12">
            <b className="card-title">🎲 {inv.room_code ? `Room ${inv.room_code}` : 'Private room'}</b>
            <div className="dim mt4">{inv.sender_display_name} wants to play with you</div>
            <div className="btn-row mt12">
              <Btn v="ghost" size="md" icon="x" onClick={() => answerRoom(inv, 'decline')}>
                Decline
              </Btn>
              <Btn v="gold" size="md" icon="check" onClick={() => answerRoom(inv, 'accept')}>
                Join Room
              </Btn>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default Invitations

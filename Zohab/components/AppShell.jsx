'use client'

// App shell: the app card, login state, bottom tabs and live notifications.
// Wraps every page (see app/layout.js). Until someone is logged in it shows the welcome screen instead.
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { api, connectSocket, disconnectSocket, getToken, listen } from '@/lib/api'
import { formatClock, OverlayContext, SessionContext } from '@/lib/lib'
import SignIn from '@/screens/SignIn'
import { Backdrop, Glows, TabBar, Toast } from './Shell.jsx'
import { Logo, PawnDefs } from './ui.jsx'

// Opens the socket and loads the logged-in player.
function startSession() {
  connectSocket()
  return api('/auth/me')
}

function endSession() {
  localStorage.removeItem('token')
  disconnectSocket()
}

function Splash() {
  return (
    <div className="splash">
      <Logo />
    </div>
  )
}


export default function AppShell({ children }) {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // the saved login is only readable in the browser
  const [toast, setToast] = useState(null)
  const [screen, setScreen] = useState(null) // the app screen element (sheets are drawn into it)

  // On first load: if a token is saved, log in with it.
  useEffect(() => {
    const session = getToken() ? startSession() : Promise.resolve(null)
    session
      .then(setUser)
      .catch(endSession)
      .finally(() => setLoading(false))
  }, [])

  const session = useMemo(
    () => ({
      user,
      setUser,
      logout() {
        endSession()
        setUser(null)
        router.push('/')
      },
    }),
    [user, router]
  )

  function onLogin(data) {
    localStorage.setItem('token', data.token)
    router.push('/')
    startSession().then(setUser).catch(endSession)
  }

  // Personal notifications from the server (invitations, matchmaking, tournament matches).
  useEffect(() => {
    if (!user) return
    const go = (path) => router.push(path)
    const fail = (err) => setToast({ emoji: '⚠️', title: err.message })
    return listen({
      'queue:matched': (d) => go(`/match/${d.match_id}`),
      'invite:received': (d) =>
        setToast({
          emoji: '🎲',
          title: `${d.sender.display_name} invited you to a room`,
          text: 'Join now and play together',
          label: 'Join',
          action: () =>
            api(`/rooms/invitations/${d.invitation_id}`, 'PUT', { action: 'accept' })
              .then((r) => go(`/match/${r.match_id}`))
              .catch(fail),
        }),
      'tournament:invited': (d) =>
        setToast({
          emoji: '🏆',
          title: `Invite: ${d.tournament_name}`,
          text: `${d.sender.display_name} invited you to play`,
          label: 'View',
          action: () => go(`/tournaments/${d.tournament_id}`),
        }),
      'tournament:match_ready': (d) =>
        setToast({
          emoji: '🏆',
          title: `Round ${d.round_no}: your match is ready`,
          text: d.scheduled_at ? `Starts at ${formatClock(d.scheduled_at)} — join the lobby early!` : 'Join the lobby early!',
          label: 'Go',
          action: () => go(`/match/${d.match_id}`),
        }),
      'tournament:match_started': (d) => {
        if (window.location.pathname !== `/match/${d.match_id}`) {
          setToast({ emoji: '⚔️', title: 'Your tournament match has started', text: 'Tap Play to jump in', label: 'Play', action: () => go(`/match/${d.match_id}`) })
        }
      },
    })
  }, [user, router])

  // Hide the notification after a few seconds
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <SessionContext.Provider value={session}>
      <OverlayContext.Provider value={screen}>
        <PawnDefs />
        <div className="stage">
          <Backdrop />
          <div className="frame">
            <div className="screen" ref={setScreen}>
              <Glows />
              {/* The login is saved in this browser, so the server always sends the splash.
                  Each page sets `instant = false` for this reason (see app/page.js). */}
              <main className="content">{loading ? <Splash /> : user ? children : <SignIn onLogin={onLogin} />}</main>
              <Suspense fallback={null}>
                <TabBar />
              </Suspense>
              {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
            </div>
          </div>
        </div>
      </OverlayContext.Provider>
    </SessionContext.Provider>
  )
}

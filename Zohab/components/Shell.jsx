'use client'

// Parts of the app card: page decoration, colour glows, bottom tabs and the in-app notification.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from '@/lib/lib'
import { Icon } from './Icons.jsx'
import { Pawn } from './ui.jsx'

const PIPS = { 3: [[30, 30], [50, 50], [70, 70]], 5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]] }

function DieFace({ value }) {
  return (
    <svg viewBox="0 0 100 100">
      <rect x="6" y="6" width="88" height="88" rx="22" fill="#fff" />
      <rect x="6" y="80" width="88" height="14" rx="7" fill="#c9cde6" />
      {PIPS[value].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" fill="#1b1f3b" />
      ))}
    </svg>
  )
}

// [kind, colour or dice value, position, size, tilt]
const DECOR = [
  ['pawn', 'red', { left: '9%', top: '13%' }, 96, -12],
  ['die', 5, { left: '19%', top: '58%' }, 72, 14],
  ['pawn', 'green', { left: '7%', top: '78%' }, 64, 8],
  ['pawn', 'yellow', { right: '10%', top: '16%' }, 84, 10],
  ['die', 3, { right: '18%', top: '68%' }, 60, -16],
  ['pawn', 'blue', { right: '6%', top: '46%' }, 70, -6],
]

// Faint floating pawns and dice on both sides of the app card (wide screens only, see globals.css).
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      {DECOR.map(([kind, value, position, size, tilt], i) => (
        <span key={i} className="deco" style={{ ...position, width: size, height: size, '--tilt': `${tilt}deg`, animationDelay: `${-i * 1.3}s` }}>
          {kind === 'pawn' ? <Pawn color={value} /> : <DieFace value={value} />}
        </span>
      ))}
    </div>
  )
}

// Soft red / blue / green / yellow lights behind every screen.
export function Glows() {
  return (
    <>
      <div className="glow glow-red" />
      <div className="glow glow-blue" />
      <div className="glow glow-green" />
      <div className="glow glow-yellow" />
    </>
  )
}

const TABS = [
  ['/', 'home', 'Home'],
  ['/tournaments', 'trophy', 'Tournaments'],
  ['/friends', 'users', 'Friends'],
  ['/profile', 'user', 'Profile'],
]

// Shown on the four tab screens only. usePathname needs a <Suspense> around it (see AppShell).
export function TabBar() {
  const pathname = usePathname()
  const { user } = useSession()
  if (!user || !TABS.some(([path]) => path === pathname)) return null
  const registered = user.player_type === 'registered'
  return (
    <nav className="tabbar">
      {TABS.filter(([path]) => registered || path !== '/friends').map(([path, icon, label]) => {
        const on = pathname === path
        return (
          <Link key={path} href={path} className={`tab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
            <span className="ib">
              <Icon name={icon} size={on ? 23 : 21} sw={on ? 2.6 : 2} />
            </span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

// toast = { emoji, title, text, label, action }
export function Toast({ toast, onClose }) {
  return (
    <div className="toast" role="status">
      <span className="em">{toast.emoji || '🔔'}</span>
      <div className="grow">
        <b>{toast.title}</b>
        {toast.text && <span>{toast.text}</span>}
      </div>
      {toast.action && (
        <button
          type="button"
          className="act"
          onClick={() => {
            onClose()
            Promise.resolve(toast.action()).catch(() => {})
          }}
        >
          {toast.label}
        </button>
      )}
      <button type="button" className="toast-x" onClick={onClose} aria-label="Close">
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}

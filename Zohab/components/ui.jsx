'use client'

// Small UI pieces used on many screens, drawn like design.html.
import { Fragment, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LUDO, OverlayContext, useGo } from '@/lib/lib'
import { Icon } from './Icons.jsx'

export { Icon }

// ---------- pawn (the Ludo token) ----------

// Gradients for every pawn on the page. Rendered once by the app shell.
export function PawnDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {Object.entries(LUDO).map(([n, c]) => (
          <Fragment key={n}>
            <radialGradient id={`ph-${n}`} cx="40%" cy="35%" r="65%">
              <stop offset="0" stopColor={c.light} />
              <stop offset=".55" stopColor={c.main} />
              <stop offset="1" stopColor={c.dark} />
            </radialGradient>
            <linearGradient id={`pb-${n}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={c.dark} />
              <stop offset=".45" stopColor={c.main} />
              <stop offset="1" stopColor={c.dark} />
            </linearGradient>
          </Fragment>
        ))}
      </defs>
    </svg>
  )
}

export function Pawn({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="pawn" aria-hidden="true">
      <ellipse cx="50" cy="90" rx="30" ry="7" fill="#000" opacity=".28" />
      <ellipse cx="50" cy="82" rx="31" ry="11" fill={LUDO[color].dark} />
      <path d="M22 80 Q25 58 40 50 L60 50 Q75 58 78 80 Q50 92 22 80 Z" fill={`url(#pb-${color})`} stroke="#fff" strokeWidth="3" />
      <circle cx="50" cy="34" r="22" fill={`url(#ph-${color})`} stroke="#fff" strokeWidth="3.5" />
      <circle cx="50" cy="34" r="8.5" fill="#fff" opacity=".92" />
      <ellipse cx="42" cy="24" rx="6" ry="4" fill="#fff" opacity=".55" />
    </svg>
  )
}

const COLORS = ['red', 'green', 'yellow', 'blue']

// Four pawns + LUDO / ARENA.
export function Logo({ scale = 1 }) {
  return (
    <div className="logo" style={{ '--k': scale }}>
      <div className="logo-pawns">
        {COLORS.map((c) => (
          <Pawn key={c} color={c} size={44 * scale} />
        ))}
      </div>
      <div className="logo-word">LUDO</div>
      <div className="logo-sub">ARENA</div>
    </div>
  )
}

// ---------- avatar ----------

const EMOJI = /\p{Extended_Pictographic}/u

// Emoji avatar if the player picked one, 🤖 for bots, otherwise the first two letters of the name.
export function Avatar({ player, size = 44, ring = 'rgba(255,255,255,.25)', dim = false }) {
  const text = player?.avatar || (player?.bot_id ? '🤖' : (player?.display_name || '?').trim().slice(0, 2).toUpperCase())
  return (
    <span className="av" style={{ width: size + 6, height: size + 6, borderColor: ring, opacity: dim ? 0.45 : 1 }}>
      <span style={{ width: size, height: size, fontSize: EMOJI.test(text) ? size * 0.55 : size * 0.38 }}>{text}</span>
    </span>
  )
}

// ---------- buttons, headers, inputs ----------

// v = primary | gold | danger | success | ghost, size = '' | md | sm
export function Btn({ v = 'primary', size = '', icon, children, className = '', type = 'button', ...props }) {
  return (
    <button type={type} className={`btn ${v} ${size} ${className}`} {...props}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />}
      <span>{children}</span>
    </button>
  )
}

// Screen header. back = a path ('/tournaments') or a function.
export function Header({ title, sub, back, right, compact = false }) {
  const go = useGo()
  return (
    <div className={`hdr${compact ? ' compact' : ''}`}>
      {back !== undefined && (
        <button type="button" className="back" aria-label="Back" onClick={() => (typeof back === 'function' ? back() : go(back))}>
          <Icon name="chevronLeft" size={24} />
        </button>
      )}
      <div className="t">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {right}
    </div>
  )
}

// Label + rounded input with an icon. Extra props go to the <input>.
export function Field({ label, icon, right, ...input }) {
  return (
    <label className="field">
      {label && <span className="lbl">{label}</span>}
      <span className="input">
        {icon && <Icon name={icon} size={20} />}
        <input {...input} />
        {right}
      </span>
    </label>
  )
}

// Choice chips: options = [[value, text, hint?, disabled?], ...]
export function Chips({ label, value, options, onChange }) {
  return (
    <>
      {label && <div className="lbl">{label}</div>}
      <div className="chips" role="radiogroup" aria-label={label}>
        {options.map(([v, text, hint, disabled]) => (
          <button
            type="button"
            key={String(v)}
            role="radio"
            aria-checked={v === value}
            className={`chip${v === value ? ' on' : ''}`}
            disabled={disabled}
            onClick={() => onChange(v)}
          >
            {text}
            {hint && <small>{hint}</small>}
          </button>
        ))}
      </div>
    </>
  )
}

const STATUS = {
  registration: ['Open', '#2ECC71'],
  in_progress: ['Live', '#FF4D6D'],
  finished: ['Finished', '#7179A6'],
  cancelled: ['Cancelled', '#7179A6'],
  waiting: ['Scheduled', '#45AAF2'],
  active: ['Playing', '#2ECC71'],
  eliminated: ['Out', '#7179A6'],
  champion: ['Champion', '#FFC93C'],
}

export function Pill({ status, label }) {
  const [text, c] = STATUS[status] || [status, '#7179A6']
  return (
    <span className="pill" style={{ color: c, borderColor: c, background: `${c}22` }}>
      {status === 'in_progress' && <i className="dot" />}
      {label || text}
    </span>
  )
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />
}

export function Empty({ emoji, children }) {
  return (
    <div className="empty">
      <span>{emoji}</span>
      <p>{children}</p>
    </div>
  )
}

// ---------- sheets and pop-ups (drawn inside the phone screen) ----------

function useEscape(onClose) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

// Bottom sheet. Tapping the dark area closes it.
export function Sheet({ title, onClose, children }) {
  const root = useContext(OverlayContext)
  useEscape(onClose)
  if (!root) return null
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="handle" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </>,
    root
  )
}

// Centered pop-up (used for the match result).
export function Dialog({ onClose, children }) {
  const root = useContext(OverlayContext)
  useEscape(onClose)
  if (!root) return null
  return createPortal(
    <>
      <div className="overlay dark" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true">
        {children}
      </div>
    </>,
    root
  )
}

// ---------- dice ----------

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

// Every new rollKey tumbles the dice for a moment, then it lands on "value".
// spinning = keeps tumbling while we wait for the server's answer.
export function Dice({ value = 6, glow = '#FFC93C', rollKey = 0, spinning = false, onRoll, size = 46 }) {
  const [tumble, setTumble] = useState(null)

  useEffect(() => {
    if (!spinning && !rollKey) return
    let frames = 0
    const timer = setInterval(() => {
      frames += 1
      if (!spinning && frames > 7) {
        clearInterval(timer)
        setTumble(null)
      } else {
        setTumble(1 + Math.floor(Math.random() * 6))
      }
    }, 70)
    return () => clearInterval(timer)
  }, [rollKey, spinning])

  const face = tumble ?? value
  return (
    <button
      type="button"
      className={`dice-wrap${onRoll ? ' ready' : ''}${tumble ? ' rolling' : ''}`}
      style={{ '--glow': glow, '--size': `${size}px` }}
      onClick={onRoll || undefined}
      disabled={!onRoll}
      aria-label={onRoll ? 'Roll the dice' : `Dice shows ${value}`}
    >
      <span className="die">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i}>{PIPS[face].includes(i) && <i className={face === 1 ? 'one' : undefined} />}</span>
        ))}
      </span>
    </button>
  )
}

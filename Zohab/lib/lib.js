// Shared helpers: Ludo colours, the logged-in session, navigation, time formatting, small hooks.
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'

// Same colours as design.html (main, light, dark per Ludo colour).
export const LUDO = {
  red: { main: '#EF3B4E', light: '#FF8A96', dark: '#A81E2D' },
  green: { main: '#1FB860', light: '#7BE3A4', dark: '#0E7A3C' },
  yellow: { main: '#F8C41D', light: '#FFE27A', dark: '#B88A00' },
  blue: { main: '#2F7FF0', light: '#86B7FF', dark: '#1550A8' },
}

// The phone screen element: sheets and pop-ups are drawn into it (so they stay inside the phone).
export const OverlayContext = createContext(null)

// The logged-in player: { user, setUser, logout }. Provided by AppShell.
export const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)

// go('/tournaments') — client-side navigation.
export function useGo() {
  const router = useRouter()
  return useCallback((path) => router.push(path), [router])
}

// Current time, refreshed every `ms` milliseconds (for countdowns and timers).
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

// Rule sets (Classic, Quick, Demo) are loaded once and shared by every form.
let ruleSetsCache = null
export function useRuleSets() {
  const [list, setList] = useState(ruleSetsCache || [])
  useEffect(() => {
    if (ruleSetsCache) return
    api('/rule-sets')
      .then((rules) => {
        ruleSetsCache = rules
        setList(rules)
      })
      .catch(() => {})
  }, [])
  return list
}

// Rule sets as chip options: [id, name, "4 home · 30s"]
export const ruleOptions = (rules) => rules.map((r) => [r.rule_set_id, r.name, `${r.tokens_to_win} home · ${r.turn_seconds}s`])

const clock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// "Today, 18:00" / "Tomorrow, 18:00" / "Fri 12 Dec, 18:00"
export function formatWhen(t) {
  const d = new Date(t)
  const day = new Date(d).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  const diff = Math.round((day - today) / 86400000)
  if (diff === 0) return `Today, ${clock(d)}`
  if (diff === 1) return `Tomorrow, ${clock(d)}`
  if (diff === -1) return `Yesterday, ${clock(d)}`
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${clock(d)}`
}

export const formatClock = (t) => clock(new Date(t))

// Milliseconds → "1d 3h" / "23h 31m" / "4m 08s"
export function formatCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

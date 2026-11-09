'use client'

// Welcome screen, log in, create account and play as guest.
import { useState } from 'react'
import { api } from '@/lib/api'
import { Btn, Field, Header, Icon, Logo, Sheet } from '@/components/ui'

// Guests are remembered by a random id saved in this browser.
function deviceId() {
  let id = localStorage.getItem('device_id')
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem('device_id', id)
  }
  return id
}

const EMPTY = { login: '', password: '', username: '', display_name: '', email: '', confirm: '', guest_name: '' }

function SignIn({ onLogin }) {
  const [view, setView] = useState('welcome') // welcome | login | signup
  const [guestOpen, setGuestOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  function open(next) {
    setError('')
    setShowPassword(false)
    setView(next)
  }

  async function run(request) {
    setError('')
    setBusy(true)
    try {
      onLogin(await request)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function login(e) {
    e.preventDefault()
    run(api('/auth/login', 'POST', { login: form.login.trim(), password: form.password }))
  }

  // Same rules as the server, checked here first.
  function signup(e) {
    e.preventDefault()
    if (!/^[A-Za-z0-9_]{3,30}$/.test(form.username)) return setError('Username must be 3-30 letters, numbers or _')
    if (!form.email.includes('@')) return setError('Please enter a valid email')
    if (form.password.length < 6) return setError('Password must be at least 6 characters')
    if (form.password !== form.confirm) return setError('Passwords do not match')
    run(
      api('/auth/register', 'POST', {
        username: form.username,
        email: form.email.trim(),
        password: form.password,
        display_name: form.display_name.trim() || undefined,
      })
    )
  }

  function guest(e) {
    e.preventDefault()
    run(api('/auth/guest', 'POST', { device_id: deviceId(), display_name: form.guest_name.trim() || undefined }))
  }

  const eye = (
    <button type="button" className="input-action" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
      <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} />
    </button>
  )
  const passwordType = showPassword ? 'text' : 'password'

  if (view === 'login') {
    return (
      <>
        <Header title="Welcome back" sub="Log in to your account" back={() => open('welcome')} />
        <div className="scroll">
          <form className="glass" onSubmit={login}>
            <Field label="Username or email" icon="at" name="login" value={form.login} onChange={change} autoComplete="username" autoFocus required />
            <Field label="Password" icon="lock" name="password" type={passwordType} value={form.password} onChange={change} autoComplete="current-password" right={eye} required />
            {error && <p className="error">{error}</p>}
            <Btn type="submit" icon="logIn" disabled={busy}>
              Log In
            </Btn>
          </form>
          <p className="switch">
            New here?{' '}
            <button type="button" className="link" onClick={() => open('signup')}>
              Create an account
            </button>
          </p>
          <p className="small center">Demo accounts: demo1 … demo4, password: password123</p>
        </div>
      </>
    )
  }

  if (view === 'signup') {
    return (
      <>
        <Header title="Create account" sub="Unlock friends, rooms & tournaments" back={() => open('welcome')} />
        <div className="scroll">
          <form className="glass" onSubmit={signup}>
            <Field label="Username" icon="at" name="username" value={form.username} onChange={change} autoComplete="username" maxLength={30} autoFocus required />
            <Field label="Display name" icon="smile" name="display_name" value={form.display_name} onChange={change} maxLength={50} placeholder="Optional" />
            <Field label="Email" icon="mail" name="email" type="email" value={form.email} onChange={change} autoComplete="email" required />
            <Field label="Password" icon="lock" name="password" type={passwordType} value={form.password} onChange={change} autoComplete="new-password" right={eye} required />
            <Field label="Confirm password" icon="lock" name="confirm" type={passwordType} value={form.confirm} onChange={change} autoComplete="new-password" required />
            {error && <p className="error">{error}</p>}
            <Btn type="submit" v="gold" icon="userPlus" disabled={busy}>
              Create Account
            </Btn>
          </form>
          <p className="switch">
            Already have an account?{' '}
            <button type="button" className="link" onClick={() => open('login')}>
              Log in
            </button>
          </p>
        </div>
      </>
    )
  }

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <Logo />
        <p className="tagline">Roll. Race. Rule the board.</p>
      </div>
      <div className="welcome-actions">
        <Btn
          v="gold"
          icon="user"
          onClick={() => {
            setError('')
            setGuestOpen(true)
          }}
        >
          Play as Guest
        </Btn>
        <Btn icon="logIn" onClick={() => open('login')}>
          Log In
        </Btn>
        <Btn v="ghost" icon="userPlus" onClick={() => open('signup')}>
          Create Account
        </Btn>
        <p className="small center">
          Guests can play vs computer, online and join rooms.
          <br />
          Create an account for friends, rooms and tournaments.
        </p>
      </div>

      {guestOpen && (
        <Sheet title="Play as Guest" onClose={() => setGuestOpen(false)}>
          <form onSubmit={guest}>
            <Field label="Your name (optional)" icon="user" name="guest_name" value={form.guest_name} onChange={change} maxLength={50} autoFocus />
            {error && <p className="error">{error}</p>}
            <Btn type="submit" v="gold" disabled={busy}>
              Let&apos;s Play
            </Btn>
          </form>
        </Sheet>
      )}
    </div>
  )
}

export default SignIn

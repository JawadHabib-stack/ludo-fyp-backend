// Everything that talks to the backend: REST calls (fetch) and the Socket.IO connection.
import { io } from 'socket.io-client'

export const getToken = () => localStorage.getItem('token')

// api('/friends') or api('/rooms', 'POST', { ... }) → returns "data", or throws the server's message.
// "/api/..." is forwarded to the backend by next.config.mjs (rewrites).
export async function api(path, method = 'GET', body) {
  const token = getToken()
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({ success: false, message: 'Server is not reachable' }))
  if (!json.success) throw new Error(json.message)
  return json.data
}

// The socket goes straight to the backend: same computer as this page, port 3000
// (or NEXT_PUBLIC_SOCKET_URL). The backend allows any origin for sockets.
function socketUrl() {
  return process.env.NEXT_PUBLIC_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:3000`
}

// One socket for the whole app, opened after login.
export let socket = null

export function connectSocket() {
  if (socket) socket.disconnect()
  socket = io(socketUrl(), { auth: { token: getToken() } })
}

export function disconnectSocket() {
  if (socket) socket.disconnect()
  socket = null
}

// Sends a socket event and waits for the server's answer { success, data | message }.
export function emit(event, data = {}) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Not connected'))
    socket.emit(event, data, (res) => (res.success ? resolve(res.data) : reject(new Error(res.message))))
  })
}

// Listens to socket events while a screen is open. Returns a function that stops listening.
export function listen(handlers) {
  const s = socket
  if (!s) return () => {}
  for (const [event, fn] of Object.entries(handlers)) s.on(event, fn)
  return () => {
    for (const [event, fn] of Object.entries(handlers)) s.off(event, fn)
  }
}

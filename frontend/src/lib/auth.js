/** Session token + profile persisted in localStorage. */

const TOKEN_KEY = 'mpc_token'
const SESSION_KEY = 'mpc_session'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

export function clearSession() {
  setToken(null)
  setSession(null)
}

export function getRole() {
  return getSession()?.role ?? null
}

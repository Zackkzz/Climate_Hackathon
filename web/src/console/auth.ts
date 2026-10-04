// Session store: token and user live in memory and in sessionStorage only (never localStorage, never the URL).
import { useSyncExternalStore } from 'react'
import { api, getToken, onAuthChange, setToken } from './api'
import type { Role, User } from './types'

const USER_KEY = 'meterwise.user'
const AT_KEY = 'meterwise.signedInAt'
let current: User | null = null
let signedInAt = 0
try {
  const raw = sessionStorage.getItem(USER_KEY)
  if (raw && getToken()) current = JSON.parse(raw) as User
  signedInAt = Number(sessionStorage.getItem(AT_KEY)) || 0
} catch {
  /* ignore */
}
const subs = new Set<() => void>()
function store(u: User | null) {
  current = u
  try {
    if (u) sessionStorage.setItem(USER_KEY, JSON.stringify(u))
    else sessionStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
  subs.forEach((s) => s())
}
// a token the server rejects clears the user too
onAuthChange(() => {
  if (!getToken() && current) store(null)
})

export function signIn(token: string, user: User) {
  setToken(token)
  signedInAt = Date.now()
  try {
    sessionStorage.setItem(AT_KEY, String(signedInAt))
  } catch {
    /* ignore */
  }
  store(user)
}
export async function signOut() {
  try {
    await api.logout()
  } catch {
    /* the token may already be gone */
  }
  setToken(null)
  store(null)
}
export const getSignedInAt = () => signedInAt
export const getUser = () => current

let checked = false
function check() {
  if (checked || !getToken()) return
  checked = true
  api
    .me()
    .then((me) => store({ ...current, ...me, role: me.role }))
    .catch(() => {
      /* a 401 already cleared the token */
    })
}

export function useUser(): User | null {
  const u = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      check()
      return () => {
        subs.delete(cb)
      }
    },
    () => current,
  )
  return u
}

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Council programme officer',
  government: 'State or council oversight',
  utility: 'Utility',
  owner: 'Landlord or strata',
  installer: 'Installer',
  funder: 'Funder',
  tenant: 'Tenant',
}
/** Where each role lands after sign-in. */
export function homeFor(role: Role): string {
  switch (role) {
    case 'manager':
    case 'government':
      return '/government'
    case 'utility':
      return '/utility'
    case 'owner':
      return '/property'
    case 'tenant':
      return '/property/my-flat'
    case 'installer':
      return '/installer'
    case 'funder':
      return '/funder'
  }
}

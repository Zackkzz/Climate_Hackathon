import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/console/api'
import { getSignedInAt, signOut, useUser } from '@/console/auth'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/portal/components/ui/alert-dialog'

// Server rules: 30 minutes idle, 12 hours absolute. Warn five minutes before either.
const IDLE_MS = 30 * 60_000
const ABS_MS = 12 * 60 * 60_000
const WARN_MS = 5 * 60_000

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Warns before a session ends and lets the person extend it. Signs out when time is up. */
export function SessionGuard() {
  const user = useUser()
  const nav = useNavigate()
  const last = useRef(Date.now())
  const [left, setLeft] = useState<number | null>(null)
  const [canExtend, setCanExtend] = useState(true)

  useEffect(() => {
    const mark = () => {
      last.current = Date.now()
    }
    const ev = ['pointerdown', 'keydown']
    ev.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    return () => ev.forEach((e) => window.removeEventListener(e, mark))
  }, [])

  useEffect(() => {
    if (!user) return
    const t = window.setInterval(() => {
      const now = Date.now()
      const idleLeft = IDLE_MS - (now - last.current)
      const signedAt = getSignedInAt()
      const absLeft = signedAt ? ABS_MS - (now - signedAt) : Infinity
      const remaining = Math.min(idleLeft, absLeft)
      if (remaining <= 0) {
        setLeft(null)
        void signOut().then(() => nav('/signin?expired=1'))
      } else if (remaining <= WARN_MS) {
        setLeft(remaining)
        setCanExtend(absLeft > idleLeft || absLeft > WARN_MS)
      } else setLeft(null)
    }, 1000)
    return () => window.clearInterval(t)
  }, [user, nav])

  const extend = async () => {
    try {
      await api.me()
      last.current = Date.now()
      setLeft(null)
    } catch {
      /* a rejected token signs the person out */
    }
  }

  return (
    <AlertDialog open={left !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Your session is about to end</AlertDialogTitle>
          <AlertDialogDescription>
            For your security you will be signed out in <strong>{left !== null ? fmt(left) : ''}</strong>. Unsaved changes will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={async () => {
              await signOut()
              nav('/signin')
            }}
          >
            Sign out now
          </AlertDialogCancel>
          {canExtend && <AlertDialogAction onClick={() => void extend()}>Stay signed in</AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

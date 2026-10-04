import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { api } from '@/console/api'
import { homeFor, signIn, useUser } from '@/console/auth'
import type { User } from '@/console/types'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { TextField } from '@/portal/components/fields'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'

const loginSchema = z.object({ email: z.string().min(1, 'Enter your email address.').email('Enter an email address like name@organisation.com.au.'), password: z.string().min(1, 'Enter your password.') })
const codeSchema = z.object({ code: z.string().trim().min(1, 'Enter your access code.').regex(/^[A-Za-z0-9-]{6,}$/, 'An access code looks like FLAT-7K2Q.') })
const mfaSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digits from your authenticator app.') })

/** A seeded account from GET /api/auth/demo-users. */
interface ExampleAccount {
  role: string
  name: string
  email?: string
  password?: string
  code?: string
  org?: { name: string }
}
const ROLE_LABEL: Record<string, string> = { manager: 'Programme manager', government: 'Government', owner: 'Property owner', funder: 'Funder', installer: 'Installer', utility: 'Utility', tenant: 'Tenant' }
const SECRET_KEY = 'mw.accountsSecret'

/**
 * The example-account list is hidden behind a secret. Open /signin#accounts=<secret> once: the secret is kept in this
 * browser (local storage) and taken out of the address bar. The part after # never reaches the server, its logs or other sites.
 * The server checks the secret (METERWISE_ACCOUNTS_SECRET) and answers 404 to anyone without it.
 */
function accountsSecret(): string | null {
  // A malformed link (bad % escape) or blocked storage must never take the sign-in page down: no list, nothing else.
  try {
    const m = /[#&]accounts=([^&]+)/.exec(window.location.hash)
    if (m) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
      const s = decodeURIComponent(m[1])
      localStorage.setItem(SECRET_KEY, s)
      return s
    }
    return localStorage.getItem(SECRET_KEY)
  } catch {
    return null
  }
}

const accountKey = (a: ExampleAccount) => a.email ?? a.code ?? a.name

/** A dropdown of example accounts, shown only to someone with the secret. */
function ExampleAccounts({ busy, onPick }: { busy: boolean; onPick: (a: ExampleAccount) => void }) {
  const [list, setList] = useState<ExampleAccount[]>([])
  const [chosen, setChosen] = useState('')
  const [hash, setHash] = useState(window.location.hash)
  // adding #accounts=... to the address of an open sign-in page changes only the hash, without a reload
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    const secret = accountsSecret()
    if (!secret) return
    let live = true
    fetch('/api/auth/demo-users', { headers: { 'X-Accounts-Secret': secret } })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: unknown) => {
        if (live && Array.isArray(l)) setList(l as ExampleAccount[])
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [hash])
  if (list.length === 0) return null
  const roles = [...new Set(list.map((a) => a.role))]
  const pick = list.find((a) => accountKey(a) === chosen)
  return (
    <section className="mw-mt-4 mw-space-y-3 mw-border mw-bg-white mw-p-4" aria-labelledby="example-accounts">
      <h2 id="example-accounts" className="nsw-h5">
        Example accounts
      </h2>
      <p className="nsw-small mw-text-muted">Every organisation and person in this list is invented. Choose one to sign in as them.</p>
      <div className="nsw-form__group">
        <label className="nsw-form__label" htmlFor="example-account">
          Account
        </label>
        <select id="example-account" className="nsw-form__select" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="">Choose an account</option>
          {roles.map((role) => (
            <optgroup key={role} label={ROLE_LABEL[role] ?? role}>
              {list
                .filter((a) => a.role === role)
                .map((a) => (
                  <option key={accountKey(a)} value={accountKey(a)}>
                    {a.org ? `${a.name}, ${a.org.name}` : a.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <Button type="button" disabled={!pick || busy} onClick={() => pick && onPick(pick)}>
        Sign in as this account
      </Button>
    </section>
  )
}

export default function SignIn() {
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const user = useUser()
  const [mfa, setMfa] = useState<string | null>(null)
  const login = useAction()
  const tenant = useAction()
  const mfaAct = useAction()

  useEffect(() => {
    document.title = 'Sign in | Meterwise'
  }, [])
  useEffect(() => {
    if (user) nav(homeFor(user.role), { replace: true })
  }, [user, nav])

  const finish = (token: string, u: User) => {
    signIn(token, u)
    const from = (loc.state as { from?: string } | null)?.from
    nav(from && from.startsWith('/') ? from : homeFor(u.role), { replace: true })
  }

  const doLogin = async (email: string, password: string) => {
    const r = await login.run(() => api.login(email, password))
    if (!r) return
    if ('mfa_required' in r) setMfa(r.ticket)
    else finish(r.token, r.user)
  }
  const doCode = async (code: string) => {
    const r = await tenant.run(() => api.tenantLogin(code.trim()))
    if (r) finish(r.token, { name: 'Tenant', role: 'tenant', flat_id: r.flat_id, project_id: r.project_id })
  }

  const loginForm = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } })
  const mfaForm = useForm<z.infer<typeof mfaSchema>>({ resolver: zodResolver(mfaSchema), defaultValues: { code: '' } })

  if (mfa) {
    return (
      <div className="mw-max-w-md">
        <PageHeader crumbs={[{ label: 'Home', to: '/' }, { label: 'Sign in' }]} title="Check your sign-in" description="Your account needs a second step. Open your authenticator app and enter the current 6-digit code." />
        <Form {...mfaForm}>
          <form
            className="mw-space-y-3 mw-border mw-bg-white mw-p-4"
            onSubmit={mfaForm.handleSubmit(async (v) => {
              const r = await mfaAct.run(() => api.mfaLogin(mfa, v.code))
              if (r) finish(r.token, r.user)
            })}
            noValidate
          >
            <TextField control={mfaForm.control} name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" />
            <ErrorAlert error={mfaAct.error} />
            <div className="nsw-display-flex mw-gap-2">
              <Button type="submit" disabled={mfaAct.busy}>
                {mfaAct.busy ? 'Checking' : 'Continue'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setMfa(null)}>
                Back
              </Button>
            </div>
          </form>
        </Form>
      </div>
    )
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Home', to: '/' }, { label: 'Sign in' }]} title="Sign in" description="Staff and partners sign in with an email address and password. Tenants use the access code from their housing provider." />
      {params.get('expired') && (
        <Alert className="mw-mb-4" role="status">
          <AlertTitle>You were signed out</AlertTitle>
          <AlertDescription>Your session ended after a period of no activity. Sign in again to carry on.</AlertDescription>
        </Alert>
      )}
      <div className="nsw-display-grid mw-gap-4 mw-md-grid-cols-2">
        <Form {...loginForm}>
          <form className="mw-space-y-3 mw-border mw-bg-white mw-p-4" onSubmit={loginForm.handleSubmit((v) => doLogin(v.email, v.password))} noValidate aria-label="Staff and partner sign-in">
            <h2 className="nsw-text-semibold">Staff and partners</h2>
            <TextField control={loginForm.control} name="email" label="Email address" type="email" autoComplete="username" />
            <TextField control={loginForm.control} name="password" label="Password" type="password" autoComplete="current-password" />
            <ErrorAlert error={login.error} title="We could not sign you in" />
            <Button type="submit" disabled={login.busy}>
              {login.busy ? 'Signing in' : 'Sign in'}
            </Button>
          </form>
        </Form>
        <Form {...codeForm}>
          <form className="mw-space-y-3 mw-border mw-bg-white mw-p-4" onSubmit={codeForm.handleSubmit((v) => doCode(v.code))} noValidate aria-label="Tenant access code">
            <h2 className="nsw-text-semibold">Tenants</h2>
            <p className="mw-text-muted">Your access code is on the letter from your housing provider.</p>
            <TextField control={codeForm.control} name="code" label="Access code" autoComplete="off" placeholder="FLAT-XXXX" />
            <ErrorAlert error={tenant.error} title="We could not find that code" />
            <Button type="submit" disabled={tenant.busy}>
              {tenant.busy ? 'Checking' : 'See my flat'}
            </Button>
          </form>
        </Form>
      </div>
      <ExampleAccounts busy={login.busy || tenant.busy} onPick={(a) => (a.code ? doCode(a.code) : doLogin(a.email ?? '', a.password ?? ''))} />
    </div>
  )
}

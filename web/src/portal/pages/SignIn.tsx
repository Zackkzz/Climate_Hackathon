import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { api } from '@/console/api'
import { ROLE_LABEL, homeFor, signIn, useUser } from '@/console/auth'
import type { DemoUser, Role, User } from '@/console/types'
import { useRes } from '@/console/useRes'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { ExampleBadge } from '@/portal/components/Status'
import { TextField } from '@/portal/components/fields'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { useAction } from '@/portal/lib/actions'

const loginSchema = z.object({ email: z.string().min(1, 'Enter your email address.').email('Enter an email address like name@example.org.'), password: z.string().min(1, 'Enter your password.') })
const codeSchema = z.object({ code: z.string().trim().min(1, 'Enter your access code.').regex(/^[A-Za-z0-9-]{6,}$/, 'An access code looks like FLAT-7K2Q.') })
const mfaSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digits from your authenticator app.') })

function split(r: Awaited<ReturnType<typeof api.demoUsers>>): { people: DemoUser[]; tenants: DemoUser[] } {
  const all: DemoUser[] = Array.isArray(r) ? r : [...(r.users ?? []), ...(r.tenant_codes ?? [])]
  return { people: all.filter((u) => u.email), tenants: all.filter((u) => !u.email && u.code) }
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
  const demo = useRes(() => api.demoUsers(), [])

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
            className="mw-space-y-3 mw-border nsw-fill-white mw-p-4"
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
      <PageHeader crumbs={[{ label: 'Home', to: '/' }, { label: 'Sign in' }]} title="Sign in" description="Council, state agency, utility, landlord, strata, installer and funder staff sign in with an email and password. Tenants use the access code from their housing provider." />
      {params.get('expired') && (
        <Alert className="mw-mb-4" role="status">
          <AlertTitle>You were signed out</AlertTitle>
          <AlertDescription>Your session ended after a period of no activity. Sign in again to carry on.</AlertDescription>
        </Alert>
      )}
      <div className="nsw-display-grid mw-gap-4 mw-md-grid-cols-2">
        <Form {...loginForm}>
          <form className="mw-space-y-3 mw-border nsw-fill-white mw-p-4" onSubmit={loginForm.handleSubmit((v) => doLogin(v.email, v.password))} noValidate aria-label="Staff and partner sign-in">
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
          <form className="mw-space-y-3 mw-border nsw-fill-white mw-p-4" onSubmit={codeForm.handleSubmit((v) => doCode(v.code))} noValidate aria-label="Tenant access code">
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

      <section className="mw-mt-6 mw-border nsw-fill-white" aria-labelledby="demo-h">
        <div className="nsw-display-flex nsw-flex-wrap nsw-align-items-center nsw-justify-content-between mw-gap-2 mw-border-b mw-px-4 mw-py-2_5">
          <h2 id="demo-h" className="nsw-text-semibold">
            Demo accounts
          </h2>
          <ExampleBadge>Demo only</ExampleBadge>
        </div>
        <div className="mw-p-4">
          <p className="mw-mb-3 mw-text-muted">These accounts belong to made-up organisations. Choose one to sign in as that role. They are switched off outside the demo.</p>
          <Gate res={demo} rows={4}>
            {(d) => {
              const { people, tenants } = split(d)
              if (people.length + tenants.length === 0) return <p className="mw-text-muted">No demo accounts are switched on.</p>
              return (
                <div className="nsw-overflow-x-auto mw-border" role="region" aria-label="Demo accounts list" tabIndex={0}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Organisation</TableHead>
                        <TableHead>
                          <span className="sr-only">Action</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {people.map((u, i) => (
                        <TableRow key={i}>
                          <TableCell>{ROLE_LABEL[u.role as Role] ?? u.role}</TableCell>
                          <TableCell>{u.name}</TableCell>
                          <TableCell>{typeof u.org === 'string' ? u.org : u.org?.name ?? ''}</TableCell>
                          <TableCell>
                            <Button size="sm" disabled={login.busy} onClick={() => void doLogin(u.email ?? '', u.password ?? '')} aria-label={`Sign in as ${ROLE_LABEL[u.role as Role] ?? u.role}, ${u.name}`}>
                              Sign in
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {tenants.slice(0, 3).map((u, i) => (
                        <TableRow key={'t' + i}>
                          <TableCell>Tenant</TableCell>
                          <TableCell>{u.name}</TableCell>
                          <TableCell>Access code {u.code}</TableCell>
                          <TableCell>
                            <Button size="sm" disabled={tenant.busy} onClick={() => u.code && void doCode(u.code)} aria-label={`Sign in as tenant ${u.name}`}>
                              Sign in
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            }}
          </Gate>
        </div>
      </section>
    </div>
  )
}

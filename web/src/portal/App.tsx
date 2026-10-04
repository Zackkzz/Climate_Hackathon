import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { homeFor, useUser } from '@/console/auth'
import { rolesFor } from '@/portal/lib/access'
import type { Role } from '@/console/types'
import { LoadingRows } from '@/portal/components/States'
import { PortalShell, PublicLayout } from '@/portal/components/Shell'
import { TooltipProvider } from '@/portal/components/ui/tooltip'
import { Toaster } from '@/portal/components/ui/sonner'
import { Government, Installer, Funder, Property, Utility } from './portals'
import { TenantLayout } from './property/TenantLayout'

const Front = lazy(() => import('./pages/Front'))
const SignIn = lazy(() => import('./pages/SignIn'))
const Enquiry = lazy(() => import('./pages/Enquiry'))
const Finder = lazy(() => import('./finder/Finder'))
const Legal = lazy(() => import('./pages/Legal'))

/** Sends signed-out people to sign in and people on the wrong portal to their own. */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const user = useUser()
  const loc = useLocation()
  if (!user) return <Navigate to="/signin" state={{ from: loc.pathname }} replace />
  if (!roles.includes(user.role)) return <PublicLayout><NoAccess /></PublicLayout>
  return <>{children}</>
}

function Titles() {
  const loc = useLocation()
  useEffect(() => {
    // each page sets a more exact title through <PageHeader>; this is the fallback
    const seg = loc.pathname.split('/').filter(Boolean)
    const base = seg.length ? seg.map((s) => s.replace(/-/g, ' ')).join(' / ') : 'Home'
    document.title = `${base.charAt(0).toUpperCase()}${base.slice(1)} | Meterwise`
  }, [loc.pathname])
  return null
}

export default function PortalApp() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200}>
        <Titles />
        <Suspense fallback={<div className="p-6"><LoadingRows label="Loading the page" /></div>}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Front />} />
              <Route path="signin" element={<SignIn />} />
              <Route path="enquiry" element={<Enquiry />} />
              <Route path="privacy" element={<Legal page="privacy" />} />
              <Route path="accessibility" element={<Legal page="accessibility" />} />
              <Route path="terms" element={<Legal page="terms" />} />
              <Route path="trust" element={<Legal page="trust" />} />
            </Route>

            <Route path="finder/*" element={<Finder />} />
            <Route path="government/*" element={<Guard roles={rolesFor('government')}><Government /></Guard>} />
            <Route path="utility/*" element={<Guard roles={rolesFor('utility')}><Utility /></Guard>} />
            <Route path="property/my-flat" element={<Guard roles={rolesFor('my-flat')}><TenantLayout /></Guard>} />
            <Route path="property/*" element={<Guard roles={rolesFor('property')}><Property /></Guard>} />
            <Route path="installer/*" element={<Guard roles={rolesFor('installer')}><Installer /></Guard>} />
            <Route path="funder/*" element={<Guard roles={rolesFor('funder')}><Funder /></Guard>} />
            <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
          </Routes>
        </Suspense>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </BrowserRouter>
  )
}

function NotFound() {
  const user = useUser()
  useEffect(() => {
    document.title = 'Page not found | Meterwise'
  }, [])
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal">Error 404</p>
      <h1 className="mt-1">Page not found</h1>
      <p className="mt-2 text-lg">There is no page at this address. Check the address, or use one of these links.</p>
      <ul className="mt-4 list-disc space-y-1 pl-5">
        <li><Link to="/">Go to the front page</Link></li>
        {user ? <li><Link to={homeFor(user.role)}>Go to your portal</Link></li> : <li><Link to="/signin">Sign in</Link></li>}
        <li><Link to="/finder">Open the block finder</Link></li>
      </ul>
    </div>
  )
}

function NoAccess() {
  const user = useUser()
  useEffect(() => {
    document.title = 'No access | Meterwise'
  }, [])
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal">Error 403</p>
      <h1 className="mt-1">You do not have access to this page</h1>
      <p className="mt-2 text-lg">Your account does not have permission to open this portal.</p>
      <ul className="mt-4 list-disc space-y-1 pl-5">
        {user && <li><Link to={homeFor(user.role)}>Go to your portal</Link></li>}
        <li><Link to="/signin">Sign in with a different account</Link></li>
        <li><Link to="/">Go to the front page</Link></li>
      </ul>
    </div>
  )
}

// re-exported so portals.tsx can share the shell
export { PortalShell }

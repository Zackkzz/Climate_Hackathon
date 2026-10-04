import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { homeFor, useUser } from '@/console/auth'
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
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
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
        <Suspense fallback={<div className="mw-p-6"><LoadingRows label="Loading the page" /></div>}>
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
            <Route path="government/*" element={<Guard roles={['manager', 'government']}><Government /></Guard>} />
            <Route path="utility/*" element={<Guard roles={['utility', 'manager']}><Utility /></Guard>} />
            <Route path="property/my-flat" element={<Guard roles={['tenant']}><TenantLayout /></Guard>} />
            <Route path="property/*" element={<Guard roles={['owner']}><Property /></Guard>} />
            <Route path="installer/*" element={<Guard roles={['installer', 'manager']}><Installer /></Guard>} />
            <Route path="funder/*" element={<Guard roles={['funder', 'manager']}><Funder /></Guard>} />
            <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
          </Routes>
        </Suspense>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div>
      <h1 className="mw-text-xl nsw-text-semibold">Page not found</h1>
      <p className="mw-mt-1 mw-text-muted">There is no page at this address. Check the address, or go to the <a href="/">front page</a>.</p>
    </div>
  )
}

// re-exported so portals.tsx can share the shell
export { PortalShell }

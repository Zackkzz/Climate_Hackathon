import { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router'
import { signOut, useUser } from '@/console/auth'
import { DemoNotice } from '@/portal/components/DemoNotice'
import { Footer } from '@/portal/components/Footer'
import { SiteHeader, SkipLink } from '@/portal/components/Shell'
import { SessionGuard } from '@/portal/components/Session'
import { LoadingRows } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'

const MyFlat = lazy(() => import('./MyFlat'))

/** The tenant's page: no sidebar, one column, made for a phone. */
export function TenantLayout() {
  const user = useUser()
  const nav = useNavigate()
  return (
    <div className="nsw-display-flex mw-min-h-svh nsw-flex-column">
      <SessionGuard />
      <DemoNotice />
      <SkipLink />
      <SiteHeader
        end={
          user && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut()
                nav('/signin')
              }}
            >
              Sign out
            </Button>
          )
        }
      />
      <main id="main" tabIndex={-1} className="nsw-container mw-flex-1 mw-py-4 mw-tenant-main">
        <Suspense fallback={<LoadingRows label="Loading your flat" />}>
          <MyFlat />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

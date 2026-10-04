import { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router'
import { signOut, useUser } from '@/console/auth'
import { Footer } from '@/portal/components/Footer'
import { SessionGuard } from '@/portal/components/Session'
import { LoadingRows } from '@/portal/components/States'
import { AppBar } from '@/portal/components/AppBar'

const MyFlat = lazy(() => import('./MyFlat'))

/** The tenant's page: no sidebar, one column, made for a phone. */
export function TenantLayout() {
  const user = useUser()
  const nav = useNavigate()
  return (
    <div className="flex min-h-svh flex-col">
      <SessionGuard />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:text-foreground">
        Skip to content
      </a>
      <AppBar>
        {user && (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-semibold text-white hover:bg-navy-800"
            onClick={async () => {
              await signOut()
              nav('/signin')
            }}
          >
            Sign out
          </button>
        )}
      </AppBar>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <Suspense fallback={<LoadingRows label="Loading your flat" />}>
          <MyFlat />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

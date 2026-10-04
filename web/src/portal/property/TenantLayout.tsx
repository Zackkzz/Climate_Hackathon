import { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router'
import { signOut, useUser } from '@/console/auth'
import { Footer } from '@/portal/components/Footer'
import { SessionGuard } from '@/portal/components/Session'
import { LoadingRows } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'

const MyFlat = lazy(() => import('./MyFlat'))

/** The tenant's page: no sidebar, one column, made for a phone. */
export function TenantLayout() {
  const user = useUser()
  const nav = useNavigate()
  return (
    <div className="flex min-h-svh flex-col">
      <SessionGuard />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-2">
        <span className="text-lg font-bold">Meterwise</span>
        {user && (
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
        )}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <Suspense fallback={<LoadingRows label="Loading your flat" />}>
          <MyFlat />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

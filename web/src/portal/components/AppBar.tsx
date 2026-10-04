import { Check, ChevronDown, CircleUser, LayoutGrid, LogOut, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ROLE_LABEL, signOut, useUser } from '@/console/auth'
import { Logo } from '@/portal/components/Logo'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/portal/components/ui/dropdown-menu'
import { portalsFor } from '@/portal/lib/access'

const barBtn = 'inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium text-white hover:bg-navy-800'

/** Portal switcher and user menu, shown when someone is signed in. */
export function UserArea({ onSearch }: { onSearch?: () => void }) {
  const user = useUser()
  const nav = useNavigate()
  const loc = useLocation()
  if (!user) return null
  const portals = portalsFor(user.role)
  return (
    <div className="flex items-center gap-1">
      {onSearch && (
        <button type="button" className={barBtn} onClick={onSearch} aria-label="Search pages">
          <Search className="size-4" aria-hidden="true" />
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden rounded-sm border border-white/40 px-1 text-xs lg:inline">Ctrl K</kbd>
        </button>
      )}
      {portals.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={barBtn}>
            <LayoutGrid className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Portals</span>
            <ChevronDown className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Switch portal</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {portals.map((p) => {
              const here = loc.pathname === p.to || loc.pathname.startsWith(p.to + '/')
              return (
                <DropdownMenuItem key={p.key} onSelect={() => nav(p.to)} aria-current={here ? 'page' : undefined}>
                  <span className="flex-1">{p.label}</span>
                  {here && <Check className="size-4" aria-hidden="true" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className={barBtn + ' max-w-[11rem] sm:max-w-[16rem]'}>
          <CircleUser className="size-5 shrink-0" aria-hidden="true" />
          <span className="hidden truncate sm:inline">{user.name}</span>
          <span className="sr-only sm:hidden">Account: {user.name}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>
            <div className="font-semibold">{user.name}</div>
            <div className="text-sm font-normal text-muted-foreground">{user.title ?? ROLE_LABEL[user.role]}</div>
            {user.org?.name && <div className="text-sm font-normal text-muted-foreground">{user.org.name}</div>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut()
              nav('/signin')
            }}
          >
            <LogOut aria-hidden="true" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The solid navy bar across the top of every page. */
export function AppBar({ lead, nav, children }: { lead?: ReactNode; nav?: ReactNode; children?: ReactNode }) {
  return (
    <header className="app-bar on-navy sticky top-0 z-40 flex h-(--header-h) shrink-0 items-center gap-3 border-b-4 border-teal-bar bg-navy-900 px-3 text-white no-print sm:px-4">
      {lead}
      <Link to="/" className="rounded-sm text-white no-underline" aria-label="Meterwise home">
        <Logo size={28} className="text-white" />
      </Link>
      {nav && <div className="ml-2 hidden min-w-0 md:block">{nav}</div>}
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  )
}

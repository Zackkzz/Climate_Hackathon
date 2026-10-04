import { ChevronsUpDown, LogOut, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ROLE_LABEL, signOut, useUser } from '@/console/auth'
import { Button } from '@/portal/components/ui/button'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/portal/components/ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/portal/components/ui/dropdown-menu'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/portal/components/ui/sidebar'
import { ExampleBadge } from './Status'
import { Footer } from './Footer'
import { SessionGuard } from './Session'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}
export interface NavGroup {
  label?: string
  items: NavItem[]
}

/** The shell for a signed-in portal: sidebar navigation, a top bar with search and the user menu, the page, the footer. */
export function PortalShell({ portal, groups }: { portal: string; groups: NavGroup[] }) {
  const user = useUser()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [loc.pathname])

  const all = groups.flatMap((g) => g.items)
  const go = (to: string) => {
    setOpen(false)
    nav(to)
  }

  return (
    <SidebarProvider defaultOpen>
      <SessionGuard />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <Sidebar>
        <SidebarHeader className="border-b px-3 py-3">
          <Link to="/" className="text-lg font-bold text-foreground no-underline">
            Meterwise
          </Link>
          <span className="text-sm text-muted-foreground">{portal}</span>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g, i) => (
            <SidebarGroup key={i}>
              {g.label && <SidebarGroupLabel className="text-sm">{g.label}</SidebarGroupLabel>}
              <SidebarMenu>
                {g.items.map((it) => (
                  <SidebarMenuItem key={it.to}>
                    <NavLink to={it.to} end={it.end}>
                      {({ isActive }) => (
                        <SidebarMenuButton asChild isActive={isActive} className="h-9 text-base no-underline">
                          <span aria-current={isActive ? 'page' : undefined}>
                            <it.icon aria-hidden="true" />
                            <span>{it.label}</span>
                          </span>
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <div className="flex min-h-svh flex-col">
          <div className="flex items-center gap-2 border-b bg-card px-3 py-2 no-print">
            <SidebarTrigger aria-label="Show or hide the menu" />
            <Button variant="outline" size="sm" className="min-w-0 flex-1 justify-start text-muted-foreground sm:w-64 sm:flex-none" onClick={() => setOpen(true)}>
              <Search aria-hidden="true" /> Search pages <kbd className="ml-auto hidden text-xs sm:inline">Ctrl K</kbd>
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="max-w-[7rem] sm:max-w-[14rem]">
                      <span className="truncate">{user.name}</span>
                      <ChevronsUpDown aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>
                      <div className="font-semibold">{user.name}</div>
                      <div className="text-sm font-normal text-muted-foreground">
                        {ROLE_LABEL[user.role]}
                        {user.org?.name ? `, ${user.org.name}` : ''}
                      </div>
                      <div className="mt-1">
                        <ExampleBadge>Example account</ExampleBadge>
                      </div>
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
              )}
            </div>
          </div>
          <main id="main" tabIndex={-1} className="flex-1 px-3 py-4 sm:px-6">
            <Outlet />
          </main>
          <Footer />
        </div>
      </SidebarInset>
      {open && <CommandDialog open={open} onOpenChange={setOpen} title="Search pages" description="Type to find a page, then press Enter.">
        <CommandInput placeholder="Search pages" />
        <CommandList>
          <CommandEmpty>No page matches.</CommandEmpty>
          <CommandGroup heading={portal}>
            {all.map((it) => (
              <CommandItem key={it.to} value={it.label} onSelect={() => go(it.to)}>
                <it.icon aria-hidden="true" /> {it.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Other">
            <CommandItem value="Public block finder" onSelect={() => (window.location.href = '/finder')}>
              Public block finder
            </CommandItem>
            <CommandItem value="Trust and security" onSelect={() => go('/trust')}>
              Trust and security
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>}
    </SidebarProvider>
  )
}

/** A plain page: header with a link home, centred column, footer. Used for the front page, sign-in and legal pages. */
export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-foreground no-underline">
            Meterwise
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link to="/signin">Sign in</Link>
            <a href="/finder">Block finder</a>
            <Link to="/enquiry">Landlord or strata enquiry</Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  )
}

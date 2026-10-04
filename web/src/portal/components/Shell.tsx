import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useUser } from '@/console/auth'
import { AppBar, UserArea } from './AppBar'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/portal/components/ui/command'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/portal/components/ui/sidebar'
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
    <SidebarProvider defaultOpen className="min-h-svh flex-col">
      <SessionGuard />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:text-foreground">
        Skip to content
      </a>
      <AppBar lead={<SidebarTrigger aria-label="Show or hide the menu" className="text-white hover:bg-navy-800 hover:text-white" />}>
        <UserArea onSearch={() => setOpen(true)} />
      </AppBar>
      <div className="flex flex-1">
        <Sidebar>
          <SidebarHeader className="border-b px-4 py-3">
            <span className="text-lg font-bold leading-tight text-foreground">{portal}</span>
            {user?.org?.name && <span className="text-sm text-muted-foreground">{user.org.name}</span>}
          </SidebarHeader>
          <SidebarContent>
            {groups.map((g, i) => (
              <SidebarGroup key={i}>
                {g.label && <SidebarGroupLabel className="px-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</SidebarGroupLabel>}
                <SidebarMenu>
                  {g.items.map((it) => (
                    <SidebarMenuItem key={it.to}>
                      <NavLink to={it.to} end={it.end}>
                        {({ isActive }) => (
                          <SidebarMenuButton asChild isActive={isActive} className="no-underline">
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
          <div className="flex min-h-[calc(100svh-var(--header-h))] flex-col">
            <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 sm:px-8">
              <Outlet />
            </main>
            <Footer />
          </div>
        </SidebarInset>
      </div>
      {open && (
        <CommandDialog open={open} onOpenChange={setOpen} title="Search pages" description="Type to find a page, then press Enter.">
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
              <CommandItem value="Block finder" onSelect={() => go('/finder')}>
                Block finder
              </CommandItem>
              <CommandItem value="Trust and security" onSelect={() => go('/trust')}>
                Trust and security
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      )}
    </SidebarProvider>
  )
}

/** A plain page: navy bar, centred column, footer. Used for the front page, sign-in, the enquiry form and the legal pages. */
export function PublicLayout({ children }: { children?: ReactNode }) {
  const user = useUser()
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:text-foreground">
        Skip to content
      </a>
      <AppBar
        nav={
          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            <Link to="/finder" className="rounded-sm px-2.5 py-1.5 font-medium text-white no-underline hover:bg-navy-800">
              Block finder
            </Link>
            <Link to="/enquiry" className="rounded-sm px-2.5 py-1.5 font-medium text-white no-underline hover:bg-navy-800">
              Enquiry
            </Link>
          </nav>
        }
      >
        {user ? (
          <UserArea />
        ) : (
          <Link to="/signin" className="inline-flex h-9 items-center rounded-sm border border-white/60 px-3 text-sm font-semibold text-white no-underline hover:bg-navy-800">
            Sign in
          </Link>
        )}
      </AppBar>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  )
}

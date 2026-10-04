// Page shells on the NSW Design System: notice strip, skip link, header, navigation, main, footer.
//   PortalShell  signed-in portals: header with user menu, side navigation (grouped), page, footer.
//   PublicLayout front page, sign-in, enquiry and legal pages: header with main navigation, page, footer.
// Navigation is implemented in React (open and close state, focus return, Escape), not with the package's scripts.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ROLE_LABEL, signOut, useUser } from '@/console/auth'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/portal/components/ui/dropdown-menu'
import { Icon } from './icons'
import type { IconType } from './icons'
import { BrandLogo } from './BrandLogo'
import { DemoNotice } from './DemoNotice'
import { Footer } from './Footer'
import { SessionGuard } from './Session'

export interface NavItem {
  to: string
  label: string
  icon: IconType
  end?: boolean
}
export interface NavGroup {
  label?: string
  items: NavItem[]
}

export const SITE_NAME = 'Meterwise'
export const SITE_DESCRIPTOR = 'Rental upgrade programme: concept demonstration'

/** Skip link (.nsw-skip). Visible on focus. */
export function SkipLink() {
  return (
    <div className="nsw-skip">
      <a href="#main">Skip to content</a>
    </div>
  )
}

/** The site header (.nsw-header). `menu` is the mobile menu button, `end` is anything to show at the right (the user menu). */
export function SiteHeader({ menu, end }: { menu?: ReactNode; end?: ReactNode }) {
  return (
    <header className="nsw-header nsw-header--simple">
      <div className="nsw-header__container">
        <div className="nsw-header__inner mw-header-inner">
          {menu}
          <div className="nsw-header__main">
            <div className="nsw-header__logo">
              <BrandLogo />
            </div>
            <div className="nsw-header__name mw-header-name">
              <div className="nsw-header__title">
                <Link to="/">{SITE_NAME}</Link>
              </div>
              <div className="nsw-header__description">{SITE_DESCRIPTOR}</div>
            </div>
          </div>
          {end && <div className="mw-header-end">{end}</div>}
        </div>
      </div>
    </header>
  )
}

function UserMenu() {
  const user = useUser()
  const nav = useNavigate()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="mw-user-button">
          <span className="mw-truncate">{user.name}</span>
          <Icon name="arrow_drop_down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="nsw-text-semibold">{user.name}</div>
          <div className="nsw-small mw-text-muted">{user.title ?? ROLE_LABEL[user.role]}</div>
          {user.org?.name && <div className="nsw-small mw-text-muted">{user.org.name}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            nav('/signin')
          }}
        >
          <Icon name="logout" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The shell for a signed-in portal: header, side navigation, the page, the footer. */
export function PortalShell({ portal, groups }: { portal: string; groups: NavGroup[] }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [find, setFind] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [q, setQ] = useState('')
  const menuBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setFind((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
    setMenuOpen(false)
  }, [loc.pathname])

  const all = groups.flatMap((g) => g.items)
  const hits = all.filter((it) => it.label.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <>
      <DemoNotice />
      <SessionGuard />
      <SkipLink />
      <SiteHeader end={<UserMenu />} />
      <section className="nsw-container mw-portal-bar no-print" aria-label="Portal tools">
        <p className="nsw-text-semibold mw-portal-name">{portal}</p>
        <div className="mw-portal-actions">
          <Button variant="outline" size="sm" onClick={() => setFind(true)}>
            <Icon name="search" /> Find a page <kbd className="mw-kbd">Ctrl K</kbd>
          </Button>
          <Button ref={menuBtn} variant="outline" size="sm" className="mw-only-narrow" aria-expanded={menuOpen} aria-controls="portal-nav" onClick={() => setMenuOpen((o) => !o)}>
            <Icon name={menuOpen ? 'close' : 'menu'} /> Menu
          </Button>
        </div>
      </section>
      <div className="nsw-container mw-portal-body">
        <nav id="portal-nav" aria-label={`${portal} pages`} className={'mw-portal-nav no-print' + (menuOpen ? ' is-open' : '')}>
          {groups.map((g, i) => (
            <div className="nsw-side-nav mw-side-nav" key={i}>
              {g.label && <p className="mw-side-nav__label">{g.label}</p>}
              <ul>
                {g.items.map((it) => (
                  <li key={it.to}>
                    <NavLink to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'current' : undefined)}>
                      {({ isActive }) => (
                        <span className="mw-side-nav__link" aria-current={isActive ? 'page' : undefined}>
                          <it.icon className="mw-side-nav__icon" />
                          <span>{it.label}</span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main id="main" tabIndex={-1} className="mw-portal-main">
          <Outlet />
        </main>
      </div>
      <Footer />
      <Dialog open={find} onOpenChange={setFind}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Find a page</DialogTitle>
            <DialogDescription>Type to filter the pages, then choose one.</DialogDescription>
          </DialogHeader>
          <div className="nsw-form__group">
            <label className="nsw-form__label" htmlFor="find-q">
              Page name
            </label>
            <input id="find-q" className="nsw-form__input" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
          <ul className="mw-find-list">
            {hits.map((it) => (
              <li key={it.to}>
                <button
                  type="button"
                  className="mw-link-button"
                  onClick={() => {
                    setFind(false)
                    setQ('')
                    nav(it.to)
                  }}
                >
                  {it.label}
                </button>
              </li>
            ))}
            {hits.length === 0 && <li className="mw-text-muted">No page matches.</li>}
            <li>
              <a href="/finder">Public block finder</a>
            </li>
            <li>
              <Link to="/trust" onClick={() => setFind(false)}>
                Trust and security
              </Link>
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A plain page: header with main navigation, centred column, footer. Used for the front page, sign-in and legal pages. */
export function PublicLayout({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    document.body.classList.toggle('main-nav-active', open)
    return () => document.body.classList.remove('main-nav-active')
  }, [open])
  const close = () => setOpen(false)
  return (
    <div className="mw-public">
      <DemoNotice />
      <SkipLink />
      <SiteHeader
        menu={
          <div className="nsw-header__menu">
            <button type="button" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(true)}>
              <Icon name="menu" />
              <span>Menu</span>
            </button>
          </div>
        }
      />
      <nav
        id="main-nav"
        className={'nsw-main-nav' + (open ? ' active' : '')}
        aria-label="Main menu"
        onKeyDown={(e) => e.key === 'Escape' && close()}
        // when closed on narrow screens the panel is off screen and hidden from assistive technology by the system's CSS
      >
        <div className="nsw-main-nav__header">
          <div className="nsw-main-nav__title">Menu</div>
          <button type="button" className="nsw-icon-button" onClick={close}>
            <Icon name="close" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>
        <ul className="nsw-main-nav__list">
          <li>
            <NavLink to="/signin" onClick={close}>
              Sign in
            </NavLink>
          </li>
          <li>
            <a href="/finder">Block finder</a>
          </li>
          <li>
            <NavLink to="/enquiry" onClick={close}>
              Landlord or strata enquiry
            </NavLink>
          </li>
        </ul>
      </nav>
      <main id="main" tabIndex={-1} className="nsw-container mw-public-main">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  )
}

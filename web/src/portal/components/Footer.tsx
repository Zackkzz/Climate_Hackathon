import { Link } from 'react-router'
import { LogoMark } from './Logo'

export function Footer() {
  return (
    <footer className="mt-10 border-t-4 border-navy-900 bg-card px-4 py-5 text-sm text-muted-foreground no-print sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <nav aria-label="Legal and trust" className="flex flex-wrap gap-x-6 gap-y-1">
          <Link to="/privacy">Privacy notice</Link>
          <Link to="/accessibility">Accessibility statement</Link>
          <Link to="/trust">Trust and security</Link>
          <Link to="/terms">Terms of use</Link>
        </nav>
        <p className="flex items-center gap-2 text-foreground">
          <LogoMark size={18} className="text-navy-900" />
          <span>Meterwise {new Date().getFullYear()}</span>
        </p>
      </div>
    </footer>
  )
}

import { Link } from 'react-router'
import { MOCK } from '@/console/api'

export function Footer() {
  return (
    <footer className="mt-8 border-t bg-card px-4 py-4 text-sm text-muted-foreground no-print">
      <nav aria-label="Legal and trust" className="flex flex-wrap gap-x-5 gap-y-1">
        <Link to="/privacy">Privacy notice</Link>
        <Link to="/accessibility">Accessibility statement</Link>
        <Link to="/trust">Trust and security</Link>
        <Link to="/terms">Terms of use</Link>
      </nav>
      <p className="mt-2 max-w-3xl">
        Meterwise is a prototype. The organisations, people, meters and readings are examples made up for the demo. Documents are not legal or financial advice.
        {MOCK ? ' This copy runs on built-in demo data with no server.' : ''}
      </p>
    </footer>
  )
}

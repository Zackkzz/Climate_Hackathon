// NSW Design System footer (.nsw-footer): a link list in the upper part, the notice and disclaimer in the lower part.
import { Link } from 'react-router'
import { MOCK } from '@/console/api'
import { DemoNotice } from './DemoNotice'

export function Footer() {
  return (
    <footer className="nsw-footer">
      <div className="nsw-footer__upper no-print">
        <div className="nsw-container">
          <nav aria-label="Legal and trust">
            <ul className="mw-footer-links">
              <li>
                <Link to="/privacy">Privacy notice</Link>
              </li>
              <li>
                <Link to="/accessibility">Accessibility statement</Link>
              </li>
              <li>
                <Link to="/trust">Trust and security</Link>
              </li>
              <li>
                <Link to="/terms">Terms of use</Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      <div className="nsw-footer__lower">
        <div className="nsw-container">
          <p className="nsw-footer__copyright mw-footer-note">
            Meterwise is a prototype. Documents are not legal or financial advice.
            {MOCK ? ' This copy runs on built-in demo data with no server.' : ''}
          </p>
          <DemoNotice where="footer" />
        </div>
      </div>
    </footer>
  )
}

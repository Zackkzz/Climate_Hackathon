// NSW Design System card (.nsw-card): the whole card is one link, made by the title's link (pseudo-element click area).
import { Link } from 'react-router'
import type { ReactNode } from 'react'

export function Card({ to, title, children }: { to: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="nsw-card mw-card">
      <div className="nsw-card__content">
        <h3 className="nsw-card__title">
          <Link to={to} className="nsw-card__link">
            {title}
          </Link>
        </h3>
        {children && <p className="nsw-card__copy">{children}</p>}
        <span className="material-icons nsw-material-icons" aria-hidden="true">
          east
        </span>
      </div>
    </div>
  )
}

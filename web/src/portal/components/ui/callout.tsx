// NSW Design System callout (.nsw-callout): a short note set apart from the text around it.
import type { ReactNode } from 'react'

export function Callout({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="nsw-callout mw-callout">
      <div className="nsw-callout__content">
        {title && <h3 className="nsw-h5">{title}</h3>}
        <p>{children}</p>
      </div>
    </div>
  )
}

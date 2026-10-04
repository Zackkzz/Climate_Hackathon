// NSW Design System accordion (.nsw-accordion). Implemented in React: a heading containing a button with aria-expanded and
// aria-controls, and a content region that is hidden until opened. Enter and Space (native button) toggle it.
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/portal/lib/utils'

export function Accordion({ title, children, defaultOpen = false, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId().replace(/:/g, '')
  return (
    <div className={cn('nsw-accordion mw-accordion', className)}>
      <h3 className="mw-accordion__heading">
        <button type="button" id={`${id}-b`} className={cn('nsw-accordion__button', open && 'active')} aria-expanded={open} aria-controls={`${id}-c`} onClick={() => setOpen((o) => !o)}>
          {title}
          <span className="material-icons nsw-material-icons" aria-hidden="true">
            keyboard_arrow_down
          </span>
        </button>
      </h3>
      <div id={`${id}-c`} role="region" aria-labelledby={`${id}-b`} className="nsw-accordion__content" hidden={!open}>
        <div className="nsw-accordion__content-wrap">{children}</div>
      </div>
    </div>
  )
}

// NSW Design System pagination (.nsw-pagination): a nav landmark with a list of links. Previous and Next are always
// present; the current page is marked with aria-current="page"; a disabled end is aria-disabled and out of the tab order.
import { cn } from '@/portal/lib/utils'

function windowOf(page: number, count: number): (number | '…')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const lo = Math.max(2, page - 1)
  const hi = Math.min(count - 1, page + 1)
  if (lo > 2) out.push('…')
  for (let i = lo; i <= hi; i++) out.push(i)
  if (hi < count - 1) out.push('…')
  out.push(count)
  return out
}

/** `page` is 1-based. */
export function Pagination({ page, count, onPage, label = 'Pagination' }: { page: number; count: number; onPage: (p: number) => void; label?: string }) {
  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (p >= 1 && p <= count) onPage(p)
  }
  return (
    <nav className="nsw-pagination" aria-label={label}>
      <ul>
        <li className={cn(page <= 1 && 'disabled')}>
          <a href="#previous" aria-label="Previous page" aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} onClick={go(page - 1)}>
            <span className="material-icons nsw-material-icons" aria-hidden="true">
              keyboard_arrow_left
            </span>
            <span>Previous</span>
          </a>
        </li>
        {windowOf(page, count).map((p, i) =>
          p === '…' ? (
            <li key={`e${i}`}>
              <span aria-hidden="true">…</span>
            </li>
          ) : (
            <li key={p}>
              <a href={`#page-${p}`} className={cn(p === page && 'active')} aria-current={p === page ? 'page' : undefined} aria-label={`Page ${p}`} onClick={go(p)}>
                {p}
              </a>
            </li>
          ),
        )}
        <li className={cn(page >= count && 'disabled')}>
          <a href="#next" aria-label="Next page" aria-disabled={page >= count} tabIndex={page >= count ? -1 : undefined} onClick={go(page + 1)}>
            <span>Next</span>
            <span className="material-icons nsw-material-icons" aria-hidden="true">
              keyboard_arrow_right
            </span>
          </a>
        </li>
      </ul>
    </nav>
  )
}

// NSW Design System checkbox. The system draws the box on the label that follows the input
// (.nsw-form__checkbox-input then .nsw-form__checkbox-label), so this renders the pair. The drawn element is an empty, hidden span
// (not a second <label>, which confuses the accessible name): the name comes from aria-label or the page label.
import { useId } from 'react'
import type { ComponentProps } from 'react'
import { cn } from '@/portal/lib/utils'

export function Checkbox({ checked, onCheckedChange, className, id, ...props }: Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'checked'> & { checked?: boolean; onCheckedChange?: (v: boolean) => void }) {
  const auto = useId()
  const cid = id ?? auto
  return (
    <span className={cn('mw-checkbox', className)}>
      <input id={cid} type="checkbox" className="nsw-form__checkbox-input" checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} {...props} />
      <span className="nsw-form__checkbox-label mw-checkbox__box" aria-hidden="true" />
    </span>
  )
}

import { Check } from 'lucide-react'
import { STAGES } from '@/console/types'
import type { Stage } from '@/console/types'
import { STAGE_LABEL } from './Status'

/**
 * The project pipeline as steps: completed, current and upcoming. State is in words and shape (a tick, a filled marker,
 * an empty marker), not only colour. `dates` gives an optional line under each step.
 */
export function StepIndicator({ current, dates }: { current: Stage; dates?: Partial<Record<Stage, string>> }) {
  const idx = STAGES.indexOf(current)
  return (
    <ol className="grid gap-0 sm:grid-cols-3 lg:grid-cols-9" aria-label="Project stages">
      {STAGES.map((st, i) => {
        const done = i < idx
        const here = i === idx
        const state = here ? 'Current' : done ? 'Done' : 'To come'
        return (
          <li key={st} aria-current={here ? 'step' : undefined} className={'relative flex gap-2 border-t-4 px-1 pb-2 pt-2 sm:block ' + (here ? 'border-mark' : done ? 'border-navy-900' : 'border-border')}>
            <span
              className={'mb-1 grid size-6 shrink-0 place-items-center border text-xs font-bold ' + (here ? 'border-mark bg-teal text-white' : done ? 'border-navy-900 bg-navy-900 text-white' : 'border-input bg-card text-muted-foreground')}
              aria-hidden="true"
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="block min-w-0">
              <span className={'block text-sm leading-tight ' + (here ? 'font-bold' : 'font-medium')}>{STAGE_LABEL[st]}</span>
              <span className="block text-xs text-muted-foreground">
                {state}
                {dates?.[st] ? `, ${dates[st]}` : ''}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

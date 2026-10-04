// The app has no tooltips (hover-only information is not accessible), so TooltipProvider only keeps App.tsx unchanged.
import type { ReactNode } from 'react'

export function TooltipProvider({ children }: { children: ReactNode; delayDuration?: number }) {
  return <>{children}</>
}

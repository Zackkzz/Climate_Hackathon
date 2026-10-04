// Charts stay on Recharts. ChartContainer sets each series colour as a CSS variable (--color-<key>) from the system's
// palette tokens; ChartTooltipContent is a plain tooltip box. Every chart is paired with a table alternative (ChartBox).
import { createContext, useContext, useId } from 'react'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@/portal/lib/utils'

export type ChartConfig = Record<string, { label?: ReactNode; color?: string }>
const Ctx = createContext<{ config: ChartConfig }>({ config: {} })

export function ChartContainer({ config, className, children, ...props }: ComponentProps<'div'> & { config: ChartConfig; children: ComponentProps<typeof ResponsiveContainer>['children'] }) {
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(config)) if (v.color) style[`--color-${k}`] = v.color
  const id = useId()
  return (
    <Ctx.Provider value={{ config }}>
      <div data-chart={id} className={cn('mw-chart', className)} style={style as CSSProperties} {...props}>
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>{children}</ResponsiveContainer>
      </div>
    </Ctx.Provider>
  )
}

export const ChartTooltip = Tooltip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTooltipContent({ active, payload, label }: any) {
  const { config } = useContext(Ctx)
  if (!active || !payload?.length) return null
  return (
    <div className="mw-chart-tip">
      {label !== undefined && label !== '' && <div className="nsw-text-semibold">{String(label)}</div>}
      {payload.map((p: { dataKey?: string; name?: string; value?: unknown; color?: string }, i: number) => (
        <div key={i} className="mw-chart-tip__row">
          <span className="mw-chart-tip__swatch" style={{ background: p.color }} aria-hidden="true" />
          <span>{config[String(p.dataKey ?? p.name)]?.label ?? p.name}</span>
          <span className="nsw-text-semibold mw-tabular">{typeof p.value === 'number' ? p.value.toLocaleString() : String(p.value ?? '')}</span>
        </div>
      ))}
    </div>
  )
}

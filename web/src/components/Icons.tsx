import type { ReactNode } from 'react'

// All icons are drawn for Meterwise (original work, released with the project). 24x24, stroke based.
const PATHS: Record<string, ReactNode> = {
  cool_roof: (
    <>
      <path d="M3 13 12 6l9 7" />
      <path d="M6 11.5V20h12v-8.5" />
      <path d="M12 2v1.5M5.6 4.6l1 1M18.4 4.6l-1 1" />
      <path d="M10 20v-4h4v4" />
    </>
  ),
  heat_pump_hot_water: (
    <>
      <path d="M12 3c3.6 4.3 6 7.1 6 10.2a6 6 0 0 1-12 0C6 10.100 8.400 7.300 12 3z" />
      <path d="M9.200 14c.5 1.400 1.600 2.200 3 2.200" />
    </>
  ),
  reverse_cycle: (
    <>
      <path d="M19.500 10.500A7.500 7.500 0 0 0 6 7.200L4.500 9" />
      <path d="M4.500 4.500V9H9" />
      <path d="M4.500 13.500A7.500 7.500 0 0 0 18 16.800l1.500-1.800" />
      <path d="M19.500 19.500V15H15" />
    </>
  ),
  induction_cooktop: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="2.800" />
      <circle cx="16" cy="9" r="1.600" />
      <circle cx="15" cy="15.500" r="2.400" />
    </>
  ),
  ceiling_insulation: (
    <>
      <path d="M3 8 12 3l9 5" />
      <path d="M5 11c1.500 1.200 2.500 1.200 4 0s2.500-1.200 4 0 2.500 1.200 4 0" />
      <path d="M5 15c1.500 1.200 2.500 1.200 4 0s2.500-1.200 4 0 2.500 1.200 4 0" />
      <path d="M5 19c1.500 1.200 2.500 1.200 4 0s2.500-1.200 4 0 2.500 1.200 4 0" />
    </>
  ),
  disconnect_gas: (
    <>
      <path d="M12 3c.8 3 4.800 4.800 4.800 9.600a4.800 4.800 0 0 1-9.600 0c0-1.800.8-3 1.900-4 0 1.800.9 2.800 1.900 2.800C11.200 8.800 10.700 6.200 12 3z" />
      <path d="M4 4l16 16" />
    </>
  ),
  check: <path d="M5 12.500 10 17.500 19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevron_down: <path d="m6 9 6 6 6-6" />,
  print: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <rect x="7" y="14" width="10" height="7" rx="1" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4.500L6 21z" />,
  pin: (
    <>
      <path d="M12 21s7-6.100 7-11.500A7 7 0 0 0 5 9.500C5 14.900 12 21 12 21z" />
      <circle cx="12" cy="9.500" r="2.500" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.500M12 7.500v.1" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.500 21.500 20h-19z" />
      <path d="M12 10v4.500M12 17.500v.1" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  home: (
    <>
      <path d="M3 11.500 12 4l9 7.500" />
      <path d="M5.500 10v10h13V10" />
    </>
  ),
  leaf: <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c3-5 6-8 10-10" />,
  retry: (
    <>
      <path d="M20 12a8 8 0 1 1-2.400-5.700" />
      <path d="M20 4v5h-5" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  map: (
    <>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
}

export type IconName = keyof typeof PATHS | string

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] ?? null}
    </svg>
  )
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="13" fill="var(--accent)" />
      <path d="M9 22 24 9l15 13" fill="none" stroke="#fff" strokeWidth="3.500" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="30" r="9" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M24 30l4-4" stroke="#f6c453" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

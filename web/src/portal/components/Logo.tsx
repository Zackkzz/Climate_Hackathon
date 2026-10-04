/** The Meterwise mark: a roof line over a meter dial. One colour, follows the text colour. */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter">
        <polyline points="3,14 16,3.5 29,14" />
        <path d="M8 28a8 8 0 0 1 16 0" />
        <line x1="16" y1="28" x2="20.5" y2="21.5" />
      </g>
    </svg>
  )
}

/** Mark plus wordmark. Set the colour with the text colour (white on navy). */
export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={'inline-flex items-center gap-2 font-bold tracking-tight ' + className} style={{ fontSize: size * 0.78 }}>
      <LogoMark size={size} />
      <span className="max-[399px]:sr-only">Meterwise</span>
    </span>
  )
}

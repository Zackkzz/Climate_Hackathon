const nf0 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Exact whole dollars: $52,000 */
export function money(n: number): string {
  const v = Math.round(n)
  return (v < 0 ? '-$' : '$') + nf0.format(Math.abs(v))
}

/** Rounded for sentences: $4,200 / $52,000 / $1.2 million */
export function moneyApprox(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)} million`
  if (a >= 10_000) return `${sign}$${nf0.format(Math.round(a / 500) * 500)}`
  if (a >= 1_000) return `${sign}$${nf0.format(Math.round(a / 100) * 100)}`
  return `${sign}$${nf0.format(Math.round(a))}`
}

/** Per-month amounts: $44 a month (whole dollars). */
export function perMonth(n: number): string {
  return `${money(n)} a month`
}

export function num(n: number): string {
  return nf0.format(Math.round(n))
}
export function num1(n: number): string {
  return nf1.format(n)
}
export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`
}

export function plural(n: number, one: string, many?: string): string {
  return `${num(n)} ${n === 1 ? one : many ?? one + 's'}`
}

export const HEAT_WORDS: Record<string, string> = {
  cooler: 'Cooler than most',
  average: 'About average',
  warm: 'A bit warmer',
  hot: 'Hotter than most',
  hottest: 'Among the hottest',
}

export function heatWord(band: string | null | undefined): string {
  return band ? HEAT_WORDS[band] ?? band : 'Heat unknown'
}

export function rentedPhrase(share: number | null): string {
  return share === null ? 'renter share unknown' : `${Math.round(share * 100)}% of nearby homes rented`
}

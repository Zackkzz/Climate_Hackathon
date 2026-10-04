const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function monthLabel(m: string | null | undefined): string {
  if (!m) return ''
  const [y, mo] = m.split('-')
  const i = Number(mo) - 1
  return MONTHS[i] ? `${MONTHS[i]} ${y}` : m
}
export function dateLabel(d: string | null | undefined): string {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  const i = Number(m) - 1
  return MONTHS[i] ? `${Number(day)} ${MONTHS[i]} ${y}` : d
}
export const ITEM_LABEL: Record<string, string> = {
  cool_roof: 'Cool roof',
  heat_pump_hot_water: 'Heat pump hot water',
  reverse_cycle: 'Reverse-cycle air conditioner',
  induction_cooktop: 'Induction cooktop',
  ceiling_insulation: 'Ceiling insulation',
  other: 'Something else',
}
export const itemLabel = (k: string) => ITEM_LABEL[k] ?? k.replace(/_/g, ' ')
export const LEDGER_LABEL: Record<string, string> = {
  charge: 'Monthly charge',
  payment: 'Payment received',
  pause_credit: 'Credit for paused charge',
  true_up_refund: 'Refund after savings check',
  adjustment: 'Adjustment',
  write_off: 'Written off',
}

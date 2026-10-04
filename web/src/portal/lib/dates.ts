const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2027-03-15" or an ISO time becomes "15 Mar 2027". */
export function dateLabelAu(d: string | null | undefined): string {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  const i = Number(m) - 1
  return M[i] ? `${Number(day)} ${M[i]} ${y}` : d
}
/** "2027-03" becomes "Mar 2027". */
export function monthLabelAu(m: string | null | undefined): string {
  if (!m) return ''
  const [y, mo] = m.split('-')
  const i = Number(mo) - 1
  return M[i] ? `${M[i]} ${y}` : m
}

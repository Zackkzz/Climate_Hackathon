import { http, qs } from './api'
import type { GasDisconnection, GasStatus, NetworkImpact, ReadingsResult, RemittanceResult, SupplyRequest, SupplyStatus, MeterRow, UtilitySummary } from './types-utility'

const U = '/api/utility'
const text = async (path: string) => (await http.send('GET', path, undefined, { raw: true })).text ?? ''

/** Split CSV text into rows of cells. Handles quoted cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const endRow = () => {
    row.push(cell)
    cell = ''
    if (row.some((x) => x.trim() !== '')) rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else cell += c
  }
  endRow()
  return rows.map((r) => r.map((x) => x.trim()))
}

/** Turn CSV with a header row into objects keyed by lower-case header. */
export function csvObjects(text: string): { header: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text)
  const header = (all[0] ?? []).map((h) => h.toLowerCase())
  return { header, rows: all.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) }
}

export const utilityApi = {
  summary: () => http.get<UtilitySummary>(`${U}/summary`),
  meters: (f: { q?: string; stage?: string; charge_status?: string } = {}) => http.get<MeterRow[]>(`${U}/meters${qs(f)}`),
  network: () => http.get<NetworkImpact>(`${U}/network-impact`),
  readingsTemplate: () => text(`${U}/readings/template.csv`),
  uploadReadings: (readings: { meter_id: string; month: string; electricity_kwh: number; gas_mj: number }[]) => http.post<ReadingsResult>(`${U}/readings`, { readings }),
  chargeFile: (month: string) => text(`${U}/charge-file${qs({ month })}`),
  remit: (month: string, rows: { meter_id: string; amount: number }[]) => http.post<RemittanceResult>(`${U}/remittance`, { month, rows }),
  gas: () => http.get<GasDisconnection[]>(`${U}/gas-disconnections`),
  updateGas: (id: number, b: { status: GasStatus; scheduled_for?: string; note?: string }) => http.post<GasDisconnection>(`${U}/gas-disconnections/${id}`, b),
  supply: () => http.get<SupplyRequest[]>(`${U}/supply-requests`),
  updateSupply: (id: number, b: { status: SupplyStatus; response: string }) => http.post<SupplyRequest>(`${U}/supply-requests/${id}`, b),
}

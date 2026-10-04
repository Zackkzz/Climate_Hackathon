import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { Link } from 'react-router'
import type { Fault } from '@/console/types'
import { DataTable } from '@/portal/components/DataTable'
import { StatusBadge } from '@/portal/components/Status'
import { fmtDate, itemLabel } from './common'

export function FaultsTable({ faults, blocks, name }: { faults: Fault[]; blocks?: { id: number; label: string }[]; name: string }) {
  const cols = useMemo<ColumnDef<Fault>[]>(() => {
    const c: ColumnDef<Fault>[] = [
      { accessorKey: 'opened_on', header: 'Reported', cell: ({ row }) => fmtDate(row.original.opened_on), meta: { csv: (r) => r.opened_on } },
      { accessorKey: 'item', header: 'Equipment', cell: ({ row }) => itemLabel(row.original.item), meta: { csv: (r) => itemLabel(r.item) } },
      { accessorKey: 'description', header: 'Problem' },
    ]
    if (blocks) c.push({ id: 'block', header: 'Block', accessorFn: (r) => blocks.find((b) => b.id === r.project_id)?.label ?? `Project ${r.project_id}`, cell: ({ row }) => <Link to={`/property/blocks/${row.original.project_id}/faults`}>{blocks.find((b) => b.id === row.original.project_id)?.label ?? `Project ${row.original.project_id}`}</Link>, meta: { label: 'Block' } })
    c.push(
      { accessorKey: 'flat_id', header: 'Flat', meta: { numeric: true } },
      { accessorKey: 'reported_by', header: 'Reported by' },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => (row.original.status === 'open' ? <StatusBadge tone="warn">Open</StatusBadge> : <StatusBadge tone="good">Fixed {fmtDate(row.original.resolved_on)}</StatusBadge>), meta: { csv: (r) => r.status } },
      { id: 'paused', header: 'Charge', accessorFn: (r) => (r.charge_paused ? 'Paused' : 'Running'), cell: ({ row }) => (row.original.charge_paused ? `Paused${row.original.months_paused ? `, ${row.original.months_paused} month${row.original.months_paused === 1 ? '' : 's'}` : ''}` : 'Running'), meta: { label: 'Charge' } },
    )
    return c
  }, [blocks])
  return <DataTable columns={cols} data={faults} caption={name} csvName={`meterwise-${name.toLowerCase().replace(/\s+/g, '-')}`} searchPlaceholder="Search faults" emptyTitle="No faults" emptyText="Nothing has been reported." getRowId={(r) => String(r.id)} initialSort={[{ id: 'opened_on', desc: true }]} />
}

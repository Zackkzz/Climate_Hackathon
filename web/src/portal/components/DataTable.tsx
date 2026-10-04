import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, RowSelectionState, SortingState, VisibilityState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download } from 'lucide-react'
import { Button } from '@/portal/components/ui/button'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/portal/components/ui/dropdown-menu'
import { Input } from '@/portal/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { saveText, toCsv } from '@/portal/lib/csv'
import { EmptyState, LoadingRows } from './States'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Right-align and use tabular figures. */
    numeric?: boolean
    /** Text for the CSV export (defaults to the cell value). */
    csv?: (row: TData) => unknown
    /** Label in the column menu and CSV header when the header is not plain text. */
    label?: string
  }
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[]
  /** Accessible name for the table region. */
  caption: string
  getRowId?: (row: T, index: number) => string
  /** Text typed here filters every column. */
  searchPlaceholder?: string
  /** Extra filters shown beside the search box. */
  filters?: ReactNode
  selectable?: boolean
  /** Buttons that act on the ticked rows. */
  bulkActions?: (rows: T[], clear: () => void) => ReactNode
  csvName?: string
  loading?: boolean
  pageSize?: number
  emptyTitle?: string
  emptyText?: ReactNode
  /** Make the first column's cell a link or button yourself; the row itself is not clickable, to keep keyboard use simple. */
  initialSort?: SortingState
  initialHidden?: VisibilityState
}

function headerText<T>(col: ColumnDef<T, any>): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return col.meta?.label ?? (typeof col.header === 'string' ? col.header : String((col as { accessorKey?: string }).accessorKey ?? col.id ?? ''))
}

export function DataTable<T>({ columns, data, caption, getRowId, searchPlaceholder = 'Search this table', filters, selectable, bulkActions, csvName, loading, pageSize = 25, emptyTitle = 'Nothing to show', emptyText, initialSort, initialHidden }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [])
  const [filter, setFilter] = useState('')
  const [visibility, setVisibility] = useState<VisibilityState>(initialHidden ?? {})
  const [selection, setSelection] = useState<RowSelectionState>({})

  const cols = useMemo<ColumnDef<T, any>[]>(() => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!selectable) return columns
    const sel: ColumnDef<T, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
      id: '_select',
      enableSorting: false,
      enableHiding: false,
      meta: { label: 'Select' },
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label={`Select row ${row.index + 1}`} />,
    }
    return [sel, ...columns]
  }, [columns, selectable])

  const table = useReactTable({
    data,
    columns: cols,
    getRowId,
    state: { sorting, globalFilter: filter, columnVisibility: visibility, rowSelection: selection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    enableRowSelection: !!selectable,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: (row, _id, value: string) => {
      const q = String(value).toLowerCase().trim()
      if (!q) return true
      return row.getAllCells().some((c) => {
        const v = c.getValue()
        return (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q)
      })
    },
  })

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)
  const filtered = table.getFilteredRowModel().rows
  const pg = table.getState().pagination
  const total = filtered.length
  const from = total === 0 ? 0 : pg.pageIndex * pg.pageSize + 1
  const to = Math.min(total, (pg.pageIndex + 1) * pg.pageSize)

  const exportCsv = () => {
    const exportable = table.getAllLeafColumns().filter((c) => c.id !== '_select' && c.getIsVisible())
    const header = exportable.map((c) => headerText(c.columnDef))
    const rows = filtered.map((r) =>
      exportable.map((c) => {
        const m = c.columnDef.meta?.csv
        return m ? m(r.original) : r.getValue(c.id)
      }),
    )
    saveText(`${csvName ?? 'export'}.csv`, toCsv(header, rows))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2" role="search" aria-label={`Filter ${caption}`}>
        <div className="min-w-[12rem] max-w-sm flex-1">
          <label htmlFor={`dt-${caption}`} className="sr-only">
            {searchPlaceholder}
          </label>
          <Input id={`dt-${caption}`} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={searchPlaceholder} className="h-9" />
        </div>
        {filters}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selectable && selectedRows.length > 0 && (
            <>
              <span className="text-sm" role="status">
                {selectedRows.length} selected
              </span>
              {bulkActions?.(selectedRows, () => table.resetRowSelection())}
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 aria-hidden="true" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                    {headerText(c.columnDef)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {csvName && (
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={total === 0}>
              <Download aria-hidden="true" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingRows label={`Loading ${caption}`} />
      ) : (
        <div className="overflow-x-auto border bg-card" role="region" aria-label={caption} tabIndex={0}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted()
                    const numeric = h.column.columnDef.meta?.numeric
                    return (
                      <TableHead key={h.id} className={numeric ? 'text-right' : ''} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : h.column.getCanSort() ? 'none' : undefined}>
                        {h.isPlaceholder ? null : h.column.getCanSort() ? (
                          <Button variant="ghost" size="sm" className={'-mx-2 h-7 px-2 font-semibold ' + (numeric ? 'flex-row-reverse' : '')} onClick={h.column.getToggleSortingHandler()}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === 'asc' ? <ArrowUp aria-hidden="true" /> : sorted === 'desc' ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" className="opacity-50" />}
                          </Button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-0">
                    <EmptyState title={filter ? 'No rows match your search' : emptyTitle}>{filter ? 'Try a shorter search, or clear the filters.' : emptyText}</EmptyState>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((r) => (
                  <TableRow key={r.id} data-state={r.getIsSelected() ? 'selected' : undefined}>
                    {r.getVisibleCells().map((c) => (
                      <TableCell key={c.id} className={c.column.columnDef.meta?.numeric ? 'text-right tabular-nums' : ''}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p role="status" aria-live="polite">
          {total === 0 ? 'No rows' : `Showing ${from} to ${to} of ${total} row${total === 1 ? '' : 's'}`}
          {filter && data.length !== total ? ` (filtered from ${data.length})` : ''}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor={`ps-${caption}`} className="text-muted-foreground">
            Rows per page
          </label>
          <Select value={String(pg.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger id={`ps-${caption}`} size="sm" className="w-[5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span>
            Page {total === 0 ? 0 : pg.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}

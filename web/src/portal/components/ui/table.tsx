// NSW Design System table (.nsw-table). The scroll wrapper is supplied by the caller (DataTable).
import type { ComponentProps } from 'react'
import { cn } from '@/portal/lib/utils'

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('nsw-table nsw-table--bordered mw-table', className)} {...props} />
}
export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead {...props} />
}
export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />
}
export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return <tfoot className={cn('mw-tfoot', className)} {...props} />
}
export function TableRow(props: ComponentProps<'tr'>) {
  return <tr {...props} />
}
export function TableHead({ scope, ...props }: ComponentProps<'th'>) {
  return <th scope={scope ?? 'col'} {...props} />
}
export function TableCell(props: ComponentProps<'td'>) {
  return <td {...props} />
}
export function TableCaption(props: ComponentProps<'caption'>) {
  return <caption {...props} />
}

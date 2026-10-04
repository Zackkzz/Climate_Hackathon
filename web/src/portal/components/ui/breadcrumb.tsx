// NSW Design System breadcrumbs (.nsw-breadcrumbs): a nav landmark holding an ordered list.
import type { ReactNode } from 'react'

export function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <nav className="nsw-breadcrumbs" aria-label="Breadcrumb">
      {children}
    </nav>
  )
}
export function BreadcrumbList({ children }: { children: ReactNode }) {
  return <ol>{children}</ol>
}
export function BreadcrumbItem({ children }: { children: ReactNode }) {
  return <li>{children}</li>
}
export function BreadcrumbLink({ children }: { children: ReactNode; asChild?: boolean }) {
  return <>{children}</>
}
export function BreadcrumbPage({ children }: { children: ReactNode }) {
  return <span aria-current="page">{children}</span>
}
export function BreadcrumbSeparator() {
  return null
}

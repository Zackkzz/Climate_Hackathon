import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '@/console/api'
import { useUser } from '@/console/auth'
import type { Role } from '@/console/types'
import { useRes } from '@/console/useRes'
import { PageHeader } from '@/portal/components/PageHeader'
import { EmptyState, ErrorAlert, LoadingRows } from '@/portal/components/States'
import { StageBadge } from '@/portal/components/Status'
import { cn } from '@/portal/lib/utils'
import Audit from './project/Audit'
import Consent from './project/Consent'
import Documents from './project/Documents'
import Faults from './project/Faults'
import Flats from './project/Flats'
import History from './project/History'
import Installation from './project/Installation'
import Offer from './project/Offer'
import Quotes from './project/Quotes'
import Savings from './project/Savings'
import Summary from './project/Summary'
import type { TabProps } from './project/shared'

export type { TabProps }
export { Summary, Audit, Offer, Consent, Quotes, Installation, Flats, Faults, Savings, Documents, History }

export const TABS: { key: string; label: string; roles: Role[]; C: (p: TabProps) => React.ReactNode }[] = [
  { key: 'summary', label: 'Summary', roles: ['manager', 'owner', 'funder'], C: Summary },
  { key: 'audit', label: 'Site audit', roles: ['manager', 'owner'], C: Audit },
  { key: 'offer', label: 'Offer', roles: ['manager', 'owner', 'funder'], C: Offer },
  { key: 'consent', label: 'Consent', roles: ['manager', 'owner'], C: Consent },
  { key: 'quotes', label: 'Quotes', roles: ['manager'], C: Quotes },
  { key: 'installation', label: 'Installation', roles: ['manager'], C: Installation },
  { key: 'flats', label: 'Flats and charges', roles: ['manager', 'owner'], C: Flats },
  { key: 'faults', label: 'Faults', roles: ['manager', 'owner'], C: Faults },
  { key: 'savings', label: 'Measured savings', roles: ['manager', 'owner', 'funder'], C: Savings },
  { key: 'documents', label: 'Documents', roles: ['manager', 'owner', 'funder'], C: Documents },
  { key: 'history', label: 'History', roles: ['manager'], C: History },
]

/** The tab strip as links, so each tab has its own address. `base` is the project's address, for example /government/projects/7. */
export function TabNav({ base, current, role }: { base: string; current: string; role: Role }) {
  return (
    <nav aria-label="Project sections" className="mb-4 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {TABS.filter((t) => t.roles.includes(role)).map((t) => (
          <li key={t.key}>
            <Link
              to={t.key === 'summary' ? base : `${base}/${t.key}`}
              aria-current={current === t.key ? 'page' : undefined}
              className={cn('inline-flex min-h-9 items-center border-b-2 px-3 py-1.5 no-underline', current === t.key ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default function ProjectPage() {
  const { id, tab = 'summary' } = useParams()
  const user = useUser()
  const role = (user?.role ?? 'manager') as Role
  const pid = Number(id)
  const res = useRes(() => api.project(pid), [pid])
  const t = TABS.find((x) => x.key === tab && x.roles.includes(role))
  const label = res.data?.label ?? `Project ${id}`

  useEffect(() => {
    document.title = `${t?.label ?? 'Project'}, ${label} | Meterwise`
  }, [t, label])

  const crumbs = [{ label: 'Government', to: '/government' }, { label: 'Projects', to: '/government/projects' }, { label }]
  if (res.data === null) {
    return (
      <>
        <PageHeader crumbs={crumbs} title={label} />
        {res.error ? <ErrorAlert error={res.error} onRetry={res.reload} title="We could not load this project" /> : <LoadingRows rows={6} label="Loading the project" />}
      </>
    )
  }
  const p = res.data
  return (
    <>
      <PageHeader crumbs={crumbs} title={<span className="inline-flex flex-wrap items-center gap-2">{p.label} <StageBadge stage={p.stage} /></span>} description={`${p.flats} flats. ${p.owner_org?.name ?? ''}`} />
      <TabNav base={`/government/projects/${p.id}`} current={tab} role={role} />
      {res.error && <ErrorAlert error={res.error} onRetry={res.reload} title="We could not refresh this project" />}
      {t ? <t.C p={p} role={role} onChange={res.set} /> : <EmptyState title="That section is not available">Choose a section from the tabs above.</EmptyState>}
    </>
  )
}

// The route and navigation tables for each portal. Each page is its own file and loads on demand.
import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'
import { Settings, AlertTriangle, BarChart3, Building2, ClipboardCheck, Download, Flame, Gauge, Grid3x3, Inbox, Landmark, ListChecks, Map, PlugZap, Receipt, ScrollText, ShieldCheck, Signpost, Table2, Wallet, Wrench, Zap } from '@/portal/components/icons'
import { useUser } from '@/console/auth'
import { LoadingRows } from '@/portal/components/States'
import { PortalShell } from '@/portal/components/Shell'
import type { NavGroup } from '@/portal/components/Shell'

const L = {
  WorkQueue: lazy(() => import('./government/WorkQueue')),
  Projects: lazy(() => import('./government/Projects')),
  NewProject: lazy(() => import('./government/NewProject')),
  ProjectPage: lazy(() => import('./government/ProjectPage')),
  Enquiries: lazy(() => import('./government/Enquiries')),
  Billing: lazy(() => import('./government/Billing')),
  Reserve: lazy(() => import('./government/Reserve')),
  Faults: lazy(() => import('./government/Faults')),
  Planner: lazy(() => import('./government/Planner')),
  Admin: lazy(() => import('./government/Admin')),
  ProgrammeOverview: lazy(() => import('./government/ProgrammeOverview')),
  Outcomes: lazy(() => import('./government/Outcomes')),
  Areas: lazy(() => import('./government/Areas')),
  Grants: lazy(() => import('./government/Grants')),
  DeliveryRoutes: lazy(() => import('./government/DeliveryRoutes')),
  Reports: lazy(() => import('./government/Reports')),
  AuditLog: lazy(() => import('./government/AuditLog')),
  Assurance: lazy(() => import('./government/Assurance')),
  USummary: lazy(() => import('./utility/Summary')),
  UMeters: lazy(() => import('./utility/Meters')),
  UNetwork: lazy(() => import('./utility/NetworkImpact')),
  UReadings: lazy(() => import('./utility/Readings')),
  UCharges: lazy(() => import('./utility/Charges')),
  UGas: lazy(() => import('./utility/GasQueue')),
  USupply: lazy(() => import('./utility/SupplyRequests')),
  PTodo: lazy(() => import('./property/Todo')),
  PBlocks: lazy(() => import('./property/Blocks')),
  PBlock: lazy(() => import('./property/BlockPage')),
  PCharges: lazy(() => import('./property/Charges')),
  PFaults: lazy(() => import('./property/Faults')),
  Installer: lazy(() => import('./installer/Installer')),
  Funder: lazy(() => import('./funder/Funder')),
}

const Fallback = () => (
  <div role="status">
    <LoadingRows label="Loading the page" />
  </div>
)

export function Government() {
  const user = useUser()
  const manager = user?.role === 'manager'
  const oversight: NavGroup = {
    label: 'Oversight',
    items: [
      { to: '/government/outcomes', label: 'Outcomes', icon: BarChart3 },
      { to: '/government/areas', label: 'Areas', icon: Map },
      { to: '/government/grants', label: 'Grants', icon: Landmark },
      { to: '/government/routes', label: 'Delivery routes', icon: Signpost },
      { to: '/government/reports', label: 'Reports', icon: Download },
      { to: '/government/audit', label: 'Audit log', icon: ScrollText },
      { to: '/government/assurance', label: 'IT assurance', icon: ShieldCheck },
    ],
  }
  const groups: NavGroup[] = manager
    ? [
        {
          label: 'Programme',
          items: [
            { to: '/government', label: 'Work queue', icon: ListChecks, end: true },
            { to: '/government/projects', label: 'Projects', icon: Building2 },
            { to: '/government/enquiries', label: 'Enquiries', icon: Inbox },
            { to: '/government/billing', label: 'Billing', icon: Receipt },
            { to: '/government/reserve', label: 'Reserve', icon: Wallet },
            { to: '/government/faults', label: 'Faults', icon: AlertTriangle },
            { to: '/government/planner', label: 'Portfolio planner', icon: Grid3x3 },
            { to: '/government/overview', label: 'Programme overview', icon: Gauge },
          ],
        },
        oversight,
        { label: 'Administration', items: [{ to: '/government/admin', label: 'System date', icon: Settings }] },
      ]
    : [{ ...oversight, label: undefined, items: [{ to: '/government', label: 'Outcomes', icon: BarChart3, end: true }, ...oversight.items.slice(1)] }]
  return (
    <Routes>
      <Route element={<PortalShell portal="Government" groups={groups} />}>
        <Route index element={<Suspense fallback={<Fallback />}>{manager ? <L.WorkQueue /> : <L.Outcomes />}</Suspense>} />
        <Route element={<Suspense fallback={<Fallback />}><RouteOutlet /></Suspense>}>
          <Route path="projects" element={<L.Projects />} />
          <Route path="projects/new" element={<L.NewProject />} />
          <Route path="projects/:id/:tab?" element={<L.ProjectPage />} />
          <Route path="enquiries" element={<L.Enquiries />} />
          <Route path="billing" element={<L.Billing />} />
          <Route path="reserve" element={<L.Reserve />} />
          <Route path="faults" element={<L.Faults />} />
          <Route path="planner" element={<L.Planner />} />
          <Route path="admin" element={<L.Admin />} />
          <Route path="overview" element={<L.ProgrammeOverview />} />
          <Route path="outcomes" element={<L.Outcomes />} />
          <Route path="areas" element={<L.Areas />} />
          <Route path="grants" element={<L.Grants />} />
          <Route path="routes" element={<L.DeliveryRoutes />} />
          <Route path="reports" element={<L.Reports />} />
          <Route path="audit" element={<L.AuditLog />} />
          <Route path="assurance" element={<L.Assurance />} />
        </Route>
      </Route>
    </Routes>
  )
}

import { Outlet } from 'react-router'
function RouteOutlet() {
  return <Outlet />
}

export function Utility() {
  const groups: NavGroup[] = [
    {
      items: [
        { to: '/utility', label: 'Summary', icon: Gauge, end: true },
        { to: '/utility/meters', label: 'Meters', icon: Zap },
        { to: '/utility/network', label: 'Network impact', icon: BarChart3 },
        { to: '/utility/readings', label: 'Meter readings', icon: Table2 },
        { to: '/utility/charges', label: 'Charges and remittance', icon: Receipt },
        { to: '/utility/gas', label: 'Gas disconnections', icon: Flame },
        { to: '/utility/supply', label: 'Supply requests', icon: PlugZap },
      ],
    },
  ]
  return (
    <Routes>
      <Route element={<PortalShell portal="Utility" groups={groups} />}>
        <Route element={<Suspense fallback={<Fallback />}><RouteOutlet /></Suspense>}>
          <Route index element={<L.USummary />} />
          <Route path="meters" element={<L.UMeters />} />
          <Route path="network" element={<L.UNetwork />} />
          <Route path="readings" element={<L.UReadings />} />
          <Route path="charges" element={<L.UCharges />} />
          <Route path="gas" element={<L.UGas />} />
          <Route path="supply" element={<L.USupply />} />
        </Route>
      </Route>
    </Routes>
  )
}

export function Property() {
  const groups: NavGroup[] = [
    {
      items: [
        { to: '/property', label: 'To do', icon: ClipboardCheck, end: true },
        { to: '/property/blocks', label: 'My blocks', icon: Building2 },
        { to: '/property/charges', label: 'Charges', icon: Receipt },
        { to: '/property/faults', label: 'Faults', icon: AlertTriangle },
      ],
    },
  ]
  return (
    <Routes>
      <Route element={<PortalShell portal="Property" groups={groups} />}>
        <Route element={<Suspense fallback={<Fallback />}><RouteOutlet /></Suspense>}>
          <Route index element={<L.PTodo />} />
          <Route path="blocks" element={<L.PBlocks />} />
          <Route path="blocks/:id/:tab?" element={<L.PBlock />} />
          <Route path="charges" element={<L.PCharges />} />
          <Route path="faults" element={<L.PFaults />} />
        </Route>
      </Route>
    </Routes>
  )
}

export function Installer() {
  const groups: NavGroup[] = [{ items: [{ to: '/installer', label: 'Tenders and work', icon: Wrench, end: true }] }]
  return (
    <Routes>
      <Route element={<PortalShell portal="Installer" groups={groups} />}>
        <Route path="*" element={<Suspense fallback={<Fallback />}><L.Installer /></Suspense>} />
      </Route>
    </Routes>
  )
}

export function Funder() {
  const groups: NavGroup[] = [{ items: [{ to: '/funder', label: 'Portfolio', icon: Landmark, end: true }] }]
  return (
    <Routes>
      <Route element={<PortalShell portal="Funder" groups={groups} />}>
        <Route path="*" element={<Suspense fallback={<Fallback />}><L.Funder /></Suspense>} />
      </Route>
    </Routes>
  )
}

import { useEffect } from 'react'
import { api } from '@/console/api'
import { propertyApi } from '@/console/api-property'
import { useRes } from '@/console/useRes'
import { Gate } from '@/portal/components/States'
import { PageHeader } from '@/portal/components/PageHeader'
import { ReportFaultDialog } from './FaultDialog'
import { FaultsTable } from './FaultsTable'

export default function Faults() {
  useEffect(() => {
    document.title = 'Faults | Property | Meterwise'
  }, [])
  const faults = useRes(() => api.faults(), [])
  const summary = useRes(() => propertyApi.summary(), [])
  const blocks = (summary.data?.blocks ?? []).map((b) => ({ id: b.id, label: b.label }))
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Property', to: '/property' }, { label: 'Faults' }]}
        title="Faults"
        description="When equipment fails, the flat's charge is paused until it is fixed. The installer fixes it under warranty."
        actions={blocks.length > 0 ? <ReportFaultDialog projects={blocks} onDone={faults.reload} /> : undefined}
      />
      <Gate res={faults}>{(f) => <FaultsTable faults={f} blocks={blocks} name="Faults across my blocks" />}</Gate>
    </>
  )
}

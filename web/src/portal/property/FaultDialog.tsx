import { useWatch } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import type { Flat } from '@/console/types'
import { useRes } from '@/console/useRes'
import { SelectField, TextAreaField } from '@/portal/components/fields'
import { FAULT_ITEMS, FormDialog } from './common'

function FlatPicker({ form, projects }: { form: any; projects: { id: number; label: string }[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const pid = Number(useWatch({ control: form.control, name: 'project_id' }))
  const flats = useRes<Flat[]>(() => (pid ? api.flats(pid) : Promise.resolve([])), [pid])
  return (
    <>
      {projects.length > 1 && <SelectField control={form.control} name="project_id" label="Block" options={projects.map((p) => ({ value: String(p.id), label: p.label }))} />}
      <SelectField
        control={form.control}
        name="flat_id"
        label="Flat"
        placeholder={flats.loading ? 'Loading flats' : 'Choose a flat'}
        options={(flats.data ?? []).map((f) => ({ value: String(f.id), label: `Unit ${f.unit}${f.tenant_name ? `, ${f.tenant_name}` : ''}` }))}
      />
    </>
  )
}

const schema = z.object({
  project_id: z.string().min(1, 'Choose a block.'),
  flat_id: z.string().min(1, 'Choose the flat with the problem.'),
  item: z.string().min(1, 'Choose what has failed.'),
  description: z.string().trim().min(5, 'Describe the problem in a few words.').max(500, 'Keep it under 500 characters.'),
})

/** Report a fault on a flat. The flat's charge is paused from this month. */
export function ReportFaultDialog({ projects, onDone, defaultProject }: { projects: { id: number; label: string }[]; onDone: () => void; defaultProject?: number }) {
  return (
    <FormDialog
      title="Report a fault"
      description="The flat's charge is paused from this month until the fault is fixed."
      trigger="Report a fault"
      triggerVariant="default"
      schema={schema}
      defaults={{ project_id: String(defaultProject ?? projects[0]?.id ?? ''), flat_id: '', item: '', description: '' }}
      fields={(form) => (
        <>
          <FlatPicker form={form} projects={projects} />
          <SelectField control={form.control} name="item" label="What has failed" options={FAULT_ITEMS} />
          <TextAreaField control={form.control} name="description" label="What is wrong" />
        </>
      )}
      summary={(v) => <p>Report "{v.description}" and pause the charge for this flat from this month.</p>}
      confirmLabel="Report the fault"
      onSubmit={async (v) => {
        await api.reportFault(Number(v.flat_id), v.item, v.description)
        onDone()
      }}
      success="Fault reported. The charge is paused."
    />
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { cleanName } from '@/portal/lib/labels'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { getBuildings } from '@/api'
import { api } from '@/console/api'
import { useRes } from '@/console/useRes'
import { PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { SelectField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/portal/components/ui/form'
import { Input } from '@/portal/components/ui/input'
import { useAction } from '@/portal/lib/actions'
import { HEAT, ownerOrgs, usePageTitle } from './shared'

const schema = z.object({
  building_id: z.string().min(1, 'Choose a building from the list.'),
  owner_org_id: z.string().min(1, 'Choose the housing provider.'),
})

export default function NewProject() {
  usePageTitle('Start a project')
  const nav = useNavigate()
  const [params] = useSearchParams()
  const buildings = useRes(() => getBuildings(), [])
  const orgs = useRes(() => api.orgs(), [])
  const [q, setQ] = useState('')
  const act = useAction()
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { building_id: params.get('b') ?? '', owner_org_id: '' } })
  const picked = form.watch('building_id')

  const matches = useMemo(() => {
    const f = buildings.data?.features ?? []
    const t = q.trim().toLowerCase()
    return (t ? f.filter((x) => x.properties.label.toLowerCase().includes(t)) : [...f].sort((a, b) => b.properties.quick_score - a.properties.quick_score)).slice(0, 10)
  }, [buildings.data, q])
  const pickedFeature = buildings.data?.features.find((f) => f.properties.id === picked)

  return (
    <div className="mw-max-w-3xl">
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Projects', to: '/government/projects' }, { label: 'Start a project' }]} title="Start a project" description="Pick a pilot building. The project starts at the screened stage, with flats made from the open-data estimate. Nothing is charged to anyone at this stage." />
      <Form {...form}>
        <form
          className="mw-space-y-4"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            const r = await act.run(() => api.createProject(v.building_id, Number(v.owner_org_id)), 'Project started')
            if (r) nav(`/government/projects/${r.id}`)
          })}
        >
          <Panel title="1. Choose the building">
            <Gate res={buildings} rows={4}>
              {() => (
                <FormField
                  control={form.control}
                  name="building_id"
                  render={() => (
                    <FormItem>
                      <FormLabel htmlFor="bq">Search by address</FormLabel>
                      <Input id="bq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Street or suburb" />
                      {pickedFeature && (
                        <p role="status" className="nsw-text-medium mw-text-success">
                          Selected: {pickedFeature.properties.label}, about {pickedFeature.properties.flats_est} flats
                        </p>
                      )}
                      {picked && !pickedFeature && <p className="mw-text-warning">Building {picked} was not found in the building dataset.</p>}
                      {matches.length === 0 ? (
                        <p className="mw-text-muted">No building matches that address.</p>
                      ) : (
                        <ul className="mw-divide-y mw-border" aria-label="Matching buildings">
                          {matches.map((f) => {
                            const on = picked === f.properties.id
                            return (
                              <li key={f.properties.id}>
                                <button type="button" aria-pressed={on} onClick={() => form.setValue('building_id', f.properties.id, { shouldValidate: true })} className={'nsw-display-flex mw-min-h-9 nsw-width-100 nsw-flex-column nsw-align-items-start mw-px-3 mw-py-1_5 nsw-text-left mw-hover-tint ' + (on ? 'mw-bg-accent' : '')}>
                                  <span className="nsw-text-medium">{f.properties.label}{on ? ' (selected)' : ''}</span>
                                  <span className="nsw-small mw-text-muted">
                                    About {f.properties.flats_est} flats. {HEAT[f.properties.heat_band] ?? f.properties.heat_band}. Screening score {f.properties.quick_score}.
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </Gate>
          </Panel>
          <Panel title="2. Choose the housing provider">
            <Gate res={orgs} rows={2}>
              {(list) => <SelectField control={form.control} name="owner_org_id" label="Provider that owns the block" options={ownerOrgs(list).map((o) => ({ value: String(o.id), label: cleanName(o.name) }))} />}
            </Gate>
          </Panel>
          <ErrorAlert error={act.error} title="We could not start the project" />
          <Button type="submit" disabled={act.busy}>
            {act.busy ? 'Starting' : 'Start the project'}
          </Button>
        </form>
      </Form>
    </div>
  )
}

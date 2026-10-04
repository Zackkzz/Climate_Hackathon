import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { http } from '@/console/api'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { SelectField, TextAreaField, TextField, NumberField } from '@/portal/components/fields'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.'),
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter an email address like name@example.org.'),
  phone: z.string().trim().optional(),
  org_kind: z.enum(['landlord', 'strata', 'community_housing'], { message: 'Choose what you are.' }),
  address: z.string().trim().min(5, 'Enter the street address of the block.'),
  flats: z.coerce.number({ message: 'Enter the number of flats.' }).int('Use a whole number.').min(1, 'There must be at least 1 flat.').max(500, 'That is more than we can take in one enquiry. Enter up to 500.'),
  message: z.string().trim().max(2000, 'Keep the message under 2000 characters.').optional(),
})
type Values = z.input<typeof schema>

export default function Enquiry() {
  const [sent, setSent] = useState<number | null>(null)
  const act = useAction()
  const form = useForm<Values, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', phone: '', org_kind: undefined, address: '', flats: '' as unknown as number, message: '' } })

  if (sent !== null) {
    return (
      <div>
        <PageHeader crumbs={[{ label: 'Home', to: '/' }, { label: 'Enquiry' }]} title="Enquiry received" />
        <Alert role="status">
          <AlertTitle>Thank you</AlertTitle>
          <AlertDescription>Your enquiry number is {sent}. A programme officer will look at your block and reply by email. This is a prototype, so nobody will actually reply.</AlertDescription>
        </Alert>
      </div>
    )
  }
  return (
    <div className="mw-max-w-2xl">
      <PageHeader crumbs={[{ label: 'Home', to: '/' }, { label: 'Enquiry' }]} title="Landlord or strata enquiry" description="Ask for your block of rented flats to be considered. We use these details only to reply to you." />
      <Form {...form}>
        <form
          className="mw-space-y-3 mw-border nsw-fill-white mw-p-4"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            const r = await act.run(() => http.post<{ id: number }>('/api/property/enquiries', v))
            if (r) setSent(r.id)
          })}
        >
          <div className="nsw-display-grid mw-gap-3 mw-sm-grid-cols-2">
            <TextField control={form.control} name="name" label="Your name" autoComplete="name" />
            <TextField control={form.control} name="email" label="Email address" type="email" autoComplete="email" />
            <TextField control={form.control} name="phone" label="Phone (optional)" type="tel" autoComplete="tel" />
            <SelectField
              control={form.control}
              name="org_kind"
              label="You are a"
              options={[
                { value: 'landlord', label: 'Landlord' },
                { value: 'strata', label: 'Strata committee' },
                { value: 'community_housing', label: 'Community housing provider' },
              ]}
            />
          </div>
          <TextField control={form.control} name="address" label="Address of the block" autoComplete="street-address" />
          <NumberField control={form.control} name="flats" label="Number of flats" min={1} className="mw-sm-max-w-xs" />
          <TextAreaField control={form.control} name="message" label="Anything else we should know (optional)" />
          <ErrorAlert error={act.error} title="We could not send your enquiry" />
          <Button type="submit" disabled={act.busy}>
            {act.busy ? 'Sending' : 'Send enquiry'}
          </Button>
        </form>
      </Form>
    </div>
  )
}

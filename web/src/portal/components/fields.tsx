// Form fields on react-hook-form with zod. Each shows its label, a hint and an inline error in text.
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Button } from '@/portal/components/ui/button'
import { Calendar } from '@/portal/components/ui/calendar'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/portal/components/ui/form'
import { Input } from '@/portal/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/portal/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { Textarea } from '@/portal/components/ui/textarea'

interface Base<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: ReactNode
  className?: string
}

export function TextField<T extends FieldValues>({ control, name, label, description, className, type = 'text', placeholder, autoComplete, inputMode, disabled }: Base<T> & { type?: string; placeholder?: string; autoComplete?: string; inputMode?: 'numeric' | 'decimal' | 'text' | 'email' | 'tel'; disabled?: boolean }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} type={type} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} disabled={disabled} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/** A number field. Value is kept as a string while typing; use z.coerce.number() in the schema. */
export function NumberField<T extends FieldValues>(p: Base<T> & { step?: number; min?: number; max?: number }) {
  const { control, name, label, description, className, step, min, max } = p
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} type="number" inputMode="decimal" step={step} min={min} max={max} className="tabular-nums" />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function TextAreaField<T extends FieldValues>({ control, name, label, description, className, rows = 3 }: Base<T> & { rows?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...field} value={field.value ?? ''} rows={rows} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function SelectField<T extends FieldValues>({ control, name, label, description, className, options, placeholder = 'Choose one' }: Base<T> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function CheckField<T extends FieldValues>({ control, name, label, description, className }: Base<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={'flex flex-row items-start gap-2 ' + (className ?? '')}>
          <FormControl>
            <Checkbox checked={!!field.value} onCheckedChange={field.onChange} className="mt-0.5" />
          </FormControl>
          <div className="space-y-1 leading-none">
            <FormLabel>{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  )
}

/** A date picker. The value is a "YYYY-MM-DD" string. The text box also accepts typing. */
export function DateField<T extends FieldValues>({ control, name, label, description, className }: Base<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const v: string = field.value ?? ''
        const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseISO(v) : undefined
        return (
          <FormItem className={className}>
            <FormLabel>{label}</FormLabel>
            <div className="flex gap-1">
              <FormControl>
                <Input {...field} value={v} placeholder="YYYY-MM-DD" inputMode="numeric" autoComplete="off" className="tabular-nums" />
              </FormControl>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label={`Pick a date for ${label}`}>
                    <CalendarIcon aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={d} defaultMonth={d} onSelect={(x) => x && field.onChange(format(x, 'yyyy-MM-dd'))} />
                </PopoverContent>
              </Popover>
            </div>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

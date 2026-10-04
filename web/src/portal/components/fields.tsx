// Form fields on react-hook-form with zod. Each shows its label, a hint and an inline error in text.
import type { ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/portal/components/ui/form'
import { Input } from '@/portal/components/ui/input'
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
            <Input {...field} value={field.value ?? ''} type="number" inputMode="decimal" step={step} min={min} max={max} className="mw-tabular" />
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
              <SelectTrigger>
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
        <FormItem className={className}>
          <div className="mw-check-row">
            <FormControl>
              <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="mw-check-label">{label}</FormLabel>
          </div>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/** A date field. The value is a "YYYY-MM-DD" string. Uses the browser's date input, which has its own calendar and
 *  keyboard entry; the system's three-box date input and calendar picker are not used (see NSW-DESIGN-SYSTEM.md). */
export function DateField<T extends FieldValues>({ control, name, label, description, className }: Base<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} type="date" autoComplete="off" className="mw-tabular" />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

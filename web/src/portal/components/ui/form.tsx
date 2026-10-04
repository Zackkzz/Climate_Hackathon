// Form field wiring on the NSW Design System form classes (.nsw-form__group, __label, __helper, __helper--error).
// react-hook-form stays as the form engine; these components give each field its label, helper text and error message
// and connect them with ids and aria-describedby.
import { Children, cloneElement, createContext, isValidElement, useContext, useId } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { Controller, FormProvider, useFormContext, useFormState } from 'react-hook-form'
import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form'
import { cn } from '@/portal/lib/utils'

const Form = FormProvider

const FieldCtx = createContext<{ name: string } | null>(null)
const ItemCtx = createContext<{ id: string } | null>(null)

function FormField<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FieldCtx.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FieldCtx.Provider>
  )
}

function useFormField() {
  const field = useContext(FieldCtx)
  const item = useContext(ItemCtx)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: field?.name })
  const state = field ? getFieldState(field.name, formState) : { error: undefined }
  const id = item?.id ?? 'x'
  return { id, error: state.error, formItemId: `${id}-item`, formDescriptionId: `${id}-desc`, formMessageId: `${id}-msg` }
}

function FormItem({ className, ...props }: ComponentProps<'div'>) {
  const id = useId()
  return (
    <ItemCtx.Provider value={{ id }}>
      <div className={cn('nsw-form__group', className)} {...props} />
    </ItemCtx.Provider>
  )
}

function FormLabel({ className, children, ...props }: ComponentProps<'label'>) {
  const { formItemId } = useFormField()
  return (
    <label className={cn('nsw-form__label', className)} htmlFor={formItemId} {...props}>
      {children}
    </label>
  )
}

/** Gives its single child the field id and the aria attributes that point at the helper and error text. */
function FormControl({ children }: { children: ReactNode }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  const only = Children.only(children)
  if (!isValidElement(only)) return <>{children}</>
  return cloneElement(only as ReactElement<Record<string, unknown>>, {
    id: formItemId,
    'aria-describedby': error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId,
    'aria-invalid': !!error,
  })
}

function FormDescription({ className, ...props }: ComponentProps<'span'>) {
  const { formDescriptionId } = useFormField()
  return <span id={formDescriptionId} className={cn('nsw-form__helper', className)} {...props} />
}

function FormMessage({ className, children }: ComponentProps<'span'>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? '') : children
  if (!body) return null
  return (
    <span id={formMessageId} role={error ? 'alert' : undefined} className={cn('nsw-form__helper nsw-form__helper--error', className)}>
      <span className="material-icons nsw-material-icons mw-icon" aria-hidden="true">
        cancel
      </span>
      {body}
    </span>
  )
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField }

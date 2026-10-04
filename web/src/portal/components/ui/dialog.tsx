// NSW Design System dialog (.nsw-dialog, __wrapper, __container, __top, __title, __close, __content), implemented in React
// rather than with the package's dialog script. It provides what the script does and what WCAG needs: it is rendered into
// document.body, marks the page behind it inert, moves focus in, traps Tab and Shift+Tab, closes on Escape (not for
// alert dialogs that need an answer), locks page scroll and returns focus to the element that opened it.
//
// Exports: Dialog family, AlertDialog family (role="alertdialog", closes only through its buttons) and the Sheet family
// (a dialog fixed to the right edge, for ledgers and details).
import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/portal/lib/utils'
import { buttonClass } from './button'
import type { ButtonVariant } from './button'

interface Ctx {
  open: boolean
  setOpen: (o: boolean) => void
  titleId: string
  descId: string
  alert: boolean
}
const DialogCtx = createContext<Ctx | null>(null)
const useDlg = () => useContext(DialogCtx)!

function Root({ open, onOpenChange, alert, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; alert: boolean; children: ReactNode }) {
  const [inner, setInner] = useState(false)
  const controlled = open !== undefined
  const isOpen = controlled ? open : inner
  const setOpen = useCallback(
    (o: boolean) => {
      if (!controlled) setInner(o)
      onOpenChange?.(o)
    },
    [controlled, onOpenChange],
  )
  const id = useId().replace(/:/g, '')
  return <DialogCtx.Provider value={{ open: isOpen, setOpen, titleId: `${id}-t`, descId: `${id}-d`, alert }}>{children}</DialogCtx.Provider>
}

export function Dialog(p: { open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode }) {
  return <Root {...p} alert={false} />
}
export function AlertDialog(p: { open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode }) {
  return <Root {...p} alert />
}

/** The element that opens the dialog. Pass the button as the single child. */
function Trigger({ children }: { asChild?: boolean; children: ReactNode }) {
  const c = useDlg()
  const only = Children.only(children) as ReactElement<{ onClick?: (e: unknown) => void }>
  if (!isValidElement(only)) return <>{children}</>
  return cloneElement(only, {
    onClick: (e: unknown) => {
      only.props.onClick?.(e)
      c.setOpen(true)
    },
    'aria-haspopup': 'dialog',
  } as object)
}
export const DialogTrigger = Trigger
export const AlertDialogTrigger = Trigger

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function Overlay({ className, side, children }: { className?: string; side?: boolean; children: ReactNode }) {
  const c = useDlg()
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(c.setOpen)
  closeRef.current = c.setOpen

  useEffect(() => {
    if (!c.open) return
    const opener = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    document.documentElement.classList.add('dialog-active')
    // focus: the first field if there is one, else the dialog itself (so the title is read first)
    const first = box.current?.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea')
    ;(first ?? box.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !c.alert) {
        e.stopPropagation()
        closeRef.current(false)
      } else if (e.key === 'Tab' && box.current) {
        const els = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null || x === document.activeElement)
        if (!els.length) {
          e.preventDefault()
          return
        }
        const a = els[0]
        const z = els[els.length - 1]
        if (e.shiftKey && (document.activeElement === a || document.activeElement === box.current)) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      root?.removeAttribute('inert')
      document.documentElement.classList.remove('dialog-active')
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [c.open, c.alert])

  if (!c.open) return null
  return createPortal(
    <div className={cn('nsw-dialog active mw-dialog', side && 'mw-dialog--side')} onMouseDown={(e) => e.target === e.currentTarget && !c.alert && c.setOpen(false)}>
      <div
        ref={box}
        role={c.alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={c.titleId}
        aria-describedby={c.descId}
        tabIndex={-1}
        className={cn('nsw-dialog__wrapper', className)}
      >
        <div className="nsw-dialog__container">
          <div className="nsw-dialog__content mw-dialog__body">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DialogContent({ className, children }: { className?: string; children: ReactNode }) {
  return <Overlay className={className}>{children}</Overlay>
}
export function AlertDialogContent({ className, children }: { className?: string; children: ReactNode }) {
  return <Overlay className={className}>{children}</Overlay>
}
export function SheetContent({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Overlay side className={className}>
      {children}
    </Overlay>
  )
}

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mw-dialog__head', className)}>{children}</div>
}
export const AlertDialogHeader = DialogHeader
export const SheetHeader = DialogHeader

/** The dialog title, in the system's top bar with a close button (not shown for alert dialogs). */
export function DialogTitle({ children }: { children: ReactNode }) {
  const c = useDlg()
  return (
    <div className="nsw-dialog__top">
      <h2 id={c.titleId} className="nsw-dialog__title nsw-h3">
        {children}
      </h2>
      {!c.alert && (
        <div className="nsw-dialog__close">
          <button type="button" className="nsw-icon-button" aria-label="Close" onClick={() => c.setOpen(false)}>
            <span className="material-icons nsw-material-icons" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
export const AlertDialogTitle = DialogTitle
export const SheetTitle = DialogTitle

export function DialogDescription({ children }: { asChild?: boolean; children: ReactNode }) {
  const c = useDlg()
  return (
    <div id={c.descId} className="mw-dialog__desc">
      {children}
    </div>
  )
}
export const AlertDialogDescription = DialogDescription
export const SheetDescription = DialogDescription

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mw-dialog__foot', className)}>{children}</div>
}
export const AlertDialogFooter = DialogFooter

type BtnProps = { children: ReactNode; onClick?: () => void; className?: string; variant?: ButtonVariant; disabled?: boolean }
/** Cancel button: closes the dialog. */
export function AlertDialogCancel({ children, onClick, className }: BtnProps) {
  const c = useDlg()
  return (
    <button
      type="button"
      className={buttonClass('outline', 'default', className)}
      onClick={() => {
        onClick?.()
        c.setOpen(false)
      }}
    >
      {children}
    </button>
  )
}
/** Confirm button: runs its handler and closes the dialog. */
export function AlertDialogAction({ children, onClick, className, disabled }: BtnProps) {
  const c = useDlg()
  return (
    <button
      type="button"
      disabled={disabled}
      className={buttonClass('default', 'default', className)}
      onClick={() => {
        onClick?.()
        c.setOpen(false)
      }}
    >
      {children}
    </button>
  )
}

export { Dialog as Sheet }

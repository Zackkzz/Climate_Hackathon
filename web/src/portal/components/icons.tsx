// Icons: Material Icons ligatures, drawn by the bundled Material Icons font (the font the NSW Design System uses).
// Each export keeps the name the pages already import. Icons here are decorative: they are hidden from assistive
// technology, and every control that holds one also carries text or an aria-label.
import type { ComponentType } from 'react'

export type IconType = ComponentType<{ className?: string }>

/** A Material Icons ligature. `name` is the ligature text, for example "download". */
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={'material-icons nsw-material-icons mw-icon' + (className ? ' ' + className : '')} aria-hidden="true">
      {name}
    </span>
  )
}

const make = (name: string): IconType => {
  const C: IconType = ({ className }) => <Icon name={name} className={className} />
  C.displayName = `Icon(${name})`
  return C
}

export const AlertCircle = make('error_outline')
export const AlertTriangle = make('warning_amber')
export const ArrowDown = make('arrow_downward')
export const ArrowUp = make('arrow_upward')
export const ArrowUpDown = make('swap_vert')
export const BarChart3 = make('bar_chart')
export const Building2 = make('apartment')
export const CalendarIcon = make('calendar_today')
export const Check = make('check')
export const CheckCircle2 = make('check_circle_outline')
export const ChevronLeft = make('chevron_left')
export const ChevronRight = make('chevron_right')
export const ChevronsLeftRight = make('swap_horiz')
export const ChevronsUpDown = make('unfold_more')
export const Circle = make('radio_button_unchecked')
export const ClipboardCheck = make('fact_check')
export const Clock = make('schedule')
export const Columns3 = make('view_column')
export const Download = make('download')
export const ExternalLink = make('open_in_new')
export const Flame = make('local_fire_department')
export const Gauge = make('speed')
export const Grid3x3 = make('grid_on')
export const Inbox = make('inbox')
export const Info = make('info_outline')
export const Landmark = make('account_balance')
export const ListChecks = make('checklist')
export const LogOut = make('logout')
export const Map = make('map')
export const MapPin = make('place')
export const Minus = make('remove')
export const MoreHorizontal = make('more_horiz')
export const Pencil = make('edit')
export const PlugZap = make('electrical_services')
export const Plus = make('add')
export const Receipt = make('receipt_long')
export const ScrollText = make('description')
export const Search = make('search')
export const ShieldCheck = make('verified_user')
export const Signpost = make('signpost')
export const Table2 = make('table_chart')
export const Thermometer = make('thermostat')
export const Trash2 = make('delete_outline')
export const Upload = make('upload')
export const Wallet = make('account_balance_wallet')
export const Wrench = make('build')
export const Zap = make('bolt')
export const Settings = make('settings')
export type { IconType as NavIcon }

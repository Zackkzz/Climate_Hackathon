// The concept-demonstration notice. One component, used at the very top of every page (above the header) and again in
// the footer. It is always visible, cannot be dismissed, and prints. Do not add a close button or a "hide" setting.

export const DEMO_NOTICE =
  'Concept demonstration by a student team for Climate Hack-tion 2026. Not a NSW Government website or service. Organisations, people, meters and readings shown are made up.'

export function DemoNotice({ where = 'top' }: { where?: 'top' | 'footer' }) {
  return (
    <aside className={'mw-demo-notice mw-demo-notice--' + where} aria-label="Concept demonstration notice">
      <p>{DEMO_NOTICE}</p>
    </aside>
  )
}

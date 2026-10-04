// The NSW Government logo, in the place the NSW Design System's header puts it (.nsw-header__waratah, before the site
// name). The artwork is the header component's own SVG, copied unaltered from the design system repository
// (NSWGTP/nsw-design-system, src/components/header/_header.hbs) into ../assets/nsw-government-logo.svg and inlined at
// build time, so the system's CSS sizes it (55px high on small screens, 76px from 62rem) and shows the "GOVERNMENT" word
// from 62rem, exactly as the system's header does. Nothing is loaded from another site.
//
// USED WITHOUT PERMISSION, FOR A LABELLED CONCEPT DEMONSTRATION ONLY. This branch is a student concept demonstration and
// is not a NSW Government website or service (the DemoNotice strip says so on every page). NSW Government branding
// guidelines restrict the logo to NSW Government entities or approved use. Before any public deployment or reuse, either
// obtain permission or remove the logo: make this component return null and delete ../assets/nsw-government-logo.svg.
// See web/NSW-DESIGN-SYSTEM.md, Branding rules.
//
// Departure from the system's markup: the system wraps the logo in a link to the government home page. Here it is not a
// link (the "Meterwise" title beside it is the home link), so it is an image named "NSW Government", the name the
// system's header gives it.
import logoSvg from '../assets/nsw-government-logo.svg?raw'

export function BrandLogo() {
  return (
    <div className="nsw-header__waratah mw-header-waratah">
      <span role="img" aria-label="NSW Government" className="mw-header-waratah__img" dangerouslySetInnerHTML={{ __html: logoSvg }} />
    </div>
  )
}

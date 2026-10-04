# Meterwise web app on the NSW Design System

This is the `meterwise-nsw-design-system` branch: the same web app as the main branch (same pages, routes, API calls and
data), with its presentation moved from Tailwind and shadcn/ui to the NSW Design System, so the two can be compared side
by side. It is a concept demonstration by a student team. It is not a NSW Government website or service.

## Branding rules (firm)

1. **NSW Government logo: used without permission, concept demonstration only.** At the project owner's request, the
   header shows the NSW Government logo. The logo is the NSW Government's. It is used here without permission, for this
   labelled concept demonstration only. NSW Government branding guidelines restrict the logo to NSW Government entities
   or approved use. **Before any public deployment or reuse, remove the logo or obtain permission.** To remove it: make
   `components/BrandLogo.tsx` return `null` and delete `assets/nsw-government-logo.svg` (nothing else refers to them).
2. The artwork is the header component's own SVG (`svg.nsw-header__waratah-gov`, viewBox 0 0 259 280), copied
   unaltered from `src/components/header/_header.hbs` in the design system repository
   (https://github.com/NSWGTP/nsw-design-system, `master`, last changed in commit 3ec89ad, 15 September 2026). The npm
   package does not ship it. Only the template's indentation was removed. It is stored in `src/portal/assets/` and
   inlined at build time (`?raw` import), so nothing is fetched from another site and the system's own CSS applies:
   55px high on small screens with the "GOVERNMENT" word hidden, 76px high with the word from 62rem, the system's
   spacing around it, proportions kept. `BrandLogo.tsx` renders it as `.nsw-header__waratah` before the site name, as
   the system's header does. The system wraps the logo in a link to the government home page; here it is not a link
   (the "Meterwise" title beside it is the home link), but an image with the accessible name the system's header gives
   it, "NSW Government". The header still shows "Meterwise" as the site title, with the descriptor "Rental upgrade
   programme: concept demonstration". The same header is used on every page, including sign-in and the tenant page.
   There is no masthead text "A NSW Government website".
3. Every page carries a full-width notice strip at the very top, above the header: "Concept demonstration by a student
   team for Climate Hack-tion 2026. Not a NSW Government website or service. Organisations, people, meters and readings
   shown are made up." It is always visible, has no close control, and prints. The same text is repeated in the footer.
   Both come from one component, `components/DemoNotice.tsx` (`where="top"` and `where="footer"`). This covers the public
   pages, sign-in, the tenant page, every portal, the block finder and the printable offer sheets. The system's print
   rules hide `.nsw-footer` and strip backgrounds; `styles/mw-components.css` puts the footer and the notice back for print.
4. Nothing says or implies the service is run, approved or endorsed by the NSW Government or any real agency, council or
   utility. The "Government portal" in the app means the council programme role inside this made-up programme.

## Package, version, licence

- `nsw-design-system` 3.28.1, installed from npm. `package.json` says ISC; the LICENSE file is MIT-style text
  ("Copyright 2020 NSW Design System"). Used as a CSS and design-token library only.
- `main.css` is imported through Vite (`src/portal/styles/nsw.css`) and used as shipped: colour tokens, grid
  (`.nsw-container`, `.nsw-layout`), typography, component styles, spacing and display utilities. The default palette is
  not changed.
- Fonts, all served from this origin (CSP `font-src 'self'`; no CDN, no Google Fonts): Public Sans (variable, from
  `@fontsource-variable/public-sans`, registered under the system's family name "Public Sans") and Material Icons (from
  `@fontsource/material-icons`, SIL Open Font Licence). Both fonts are bundled by Vite.
- The package ships no HTML documentation. Markup was written from the class names in `main.css` and the SCSS in
  `node_modules/nsw-design-system/src`, and checked in the browser.

## What was removed

Tailwind, `tw-animate-css`, shadcn/ui, all Radix packages, `lucide-react`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `cmdk`, `next-themes`, `react-day-picker`, `sonner`, and the Inter font. Still used: React, React
Router, react-hook-form with zod, TanStack Table (headless), Recharts, MapLibre, date-fns.

## Behaviours: React, not the package scripts

The package's behaviour scripts (`dist/js`) are **not** run. They attach to server-rendered DOM and would fight React's
rendering. Every behaviour is reimplemented in React with the system's classes and the matching ARIA:

| Behaviour | Where | Notes |
|---|---|---|
| Dialog, alert dialog, side sheet | `components/ui/dialog.tsx` | Portal to `body`; `#root` made `inert` while open; focus moves in and is trapped (Tab, Shift+Tab); Escape closes (not for alert dialogs); scroll lock; focus returns to the opener; `role="dialog"` or `"alertdialog"`, `aria-modal`, labelled and described |
| Tabs | `components/ui/tabs.tsx` | `tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`, roving tabindex, Left/Right/Home/End |
| Project page tabs | `government/ProjectPage.tsx` | Same look, but real links (each tab has its own address) with `aria-current="page"` |
| Accordion | `components/ui/accordion.tsx` | Heading with a button, `aria-expanded`, `aria-controls`, `hidden` content region |
| Menu button (user menu, row actions, column picker) | `components/ui/dropdown-menu.tsx` | `aria-haspopup="menu"`, `aria-expanded`, `menu`/`menuitem`/`menuitemcheckbox`, arrow keys, Home/End, Escape returns focus, outside click closes |
| Main navigation (public pages, small screens) | `components/Shell.tsx` | Open/close state, Escape, `aria-expanded`, `aria-controls`; body scroll class as the system expects |
| Side navigation (portals) | `components/Shell.tsx` | Grouped lists in a `nav`, `aria-current="page"`; below 62rem it opens from a "Menu" button with `aria-expanded` |
| Select | `components/ui/select.tsx` | Native `<select>` (see departures) |
| Pagination, sorting, filtering, CSV | `components/DataTable.tsx`, `ui/pagination.tsx` | TanStack Table headless; sort buttons set `aria-sort`; search, column picker, rows-per-page, page links, CSV export all kept |
| Find a page (Ctrl K) | `components/Shell.tsx` | A dialog with a filter box and a list of links (replaces the command palette) |
| Messages after an action | `components/ui/sonner.tsx` | In-page alerts in a polite live region; same `toast.success` and `toast.error` calls |

## Components used and where

| System component | Where it is used |
|---|---|
| Notice strip (local, `.mw-demo-notice`) | `DemoNotice.tsx`: top of every page and in the footer |
| Skip link `.nsw-skip` | `Shell.tsx` `SkipLink`, on every layout |
| Header `.nsw-header` | `Shell.tsx` `SiteHeader`: portals, public pages, tenant page, block finder |
| Header logo `.nsw-header__waratah` | `BrandLogo.tsx` (in `SiteHeader`; see branding rules 1 and 2) |
| Main navigation `.nsw-main-nav` | `Shell.tsx` `PublicLayout` |
| Side navigation `.nsw-side-nav` | `Shell.tsx` `PortalShell` (all portals) |
| Breadcrumbs `.nsw-breadcrumbs` | `ui/breadcrumb.tsx`, used by `PageHeader` on every portal page |
| Footer `.nsw-footer` | `Footer.tsx` |
| Buttons `.nsw-button` (dark, dark-outline-solid, light, danger, small) | `ui/button.tsx` (about 150 uses) |
| Form group, label, helper text, error message `.nsw-form__*` | `ui/form.tsx`, `ui/label.tsx`, `fields.tsx`: all react-hook-form fields |
| Text input, textarea `.nsw-form__input` | `ui/input.tsx`, `ui/textarea.tsx` |
| Select `.nsw-form__select` | `ui/select.tsx` |
| Checkbox `.nsw-form__checkbox-input` / `-label` | `ui/checkbox.tsx` |
| Tabs `.nsw-tabs` | `ui/tabs.tsx` (finder, installer, property block), `ProjectPage.tsx` |
| Accordion `.nsw-accordion` | `finder/Build.tsx` ("Advanced", "What this assumes") |
| Card `.nsw-card` | `ui/card.tsx`, front page portal links |
| Callout `.nsw-callout` | `ui/callout.tsx`, front page |
| In-page alert `.nsw-in-page-alert` | `ui/alert.tsx`: `ErrorAlert`, notices, toasts |
| Status label `.nsw-status-label` | `ui/badge.tsx`, `Status.tsx` (stage, tone and example labels, each with an icon and words) |
| Pagination `.nsw-pagination` | `ui/pagination.tsx`, `DataTable.tsx` |
| Progress indicator `.nsw-progress-indicator` | `ui/progress.tsx` (consent, installation, flats) |
| Table `.nsw-table` | `ui/table.tsx`, `DataTable.tsx`, chart table alternative, offer sheets |
| Dialog `.nsw-dialog` | `ui/dialog.tsx`: forms, confirmations, session warning, flat ledger side sheet |
| Loader `.nsw-loader` | `States.tsx` `LoadingRows` |
| Icons `.nsw-material-icons` | `components/icons.tsx`: Material Icons ligatures, decorative ones `aria-hidden` |
| Display, flex, alignment, text and overflow utilities `.nsw-display-*`, `.nsw-align-items-*`, `.nsw-justify-content-*`, `.nsw-text-*`, `.nsw-small`, `.nsw-width-100`, `.nsw-overflow-*`, `.nsw-position-*`, `.nsw-h3/.nsw-h5` | Throughout the pages (replacing the Tailwind classes) |

Not used, because the app has no place for them: global alert, tags, list items, steps, tooltip, results bar and
filters, file upload, hero banner, in-page nav, quick exit, cookie banner. The block finder's three steps are buttons
that change the view, so they stay buttons and are not the system's `.nsw-steps`. Filters are ordinary labelled form
controls beside the table search box. Native `<details>` is kept for one "Show more" list in `finder/Build.tsx`.

## Utility stylesheet

`src/portal/styles/utilities.css` is the one local utility stylesheet. It holds only layout utilities the pages rely on and
the system does not provide: gap (`mw-gap-*`), padding and margin (`mw-p-*`, `mw-mt-*`), vertical rhythm (`mw-space-y-*`),
widths and heights (`mw-w-*`, `mw-max-w-*`), grid columns (`mw-grid-cols-*`) and a few `sm`/`md`/`lg`/`xl` variants. Values
are multiples of 0.25rem (the system spaces on a 4px grid) and the breakpoints are the system's own (36rem, 48rem, 62rem,
75rem). It was generated once from the classes in use and is now maintained by hand. Colour, border, radius and typography
utilities from the old pages were replaced with system classes (`nsw-text-semibold`, `nsw-small`, `nsw-border-radius`, ...)
or, where the system has no class, with the few rules below.

`src/portal/styles/mw-components.css` holds the styles for the app's own pieces, all written with `--nsw-*` tokens:
page shell grid, panel, figures and facts layouts, text colour helpers, neutral borders, menu button, switch, toasts, the
notice strip, finder layout, chart tooltip, print rules.

## Departures from the system, and why

- **Notice strip** replaces the system's masthead; the **logo** is an image, not a link (branding rules above).
- **Select is a native `<select>`** (styled `.nsw-form__select`). The system's select enhancement script builds a custom
  list; a native control has better keyboard and screen reader behaviour and works with react-hook-form unchanged. Option
  labels must be plain text.
- **Date fields use the browser's date input**, not the system's three-box date input or calendar picker. It has its
  own calendar, keyboard entry and validation, and the value is still a `YYYY-MM-DD` string.
- **File upload** is a native file input with light styling, not the system's file-upload component (drop zone and file
  list script).
- **Switch** (finder "What goes in?") is a checkbox with `role="switch"`; the system has no switch.
- **Menu button** is local; the system has no menu component.
- **Dialog footer** sits at the end of the content instead of being pinned to the bottom (`.nsw-dialog__bottom`), because
  dialogs here hold forms with their own submit buttons, and a pinned footer cannot sit inside a form.
- **Checkbox** is drawn by an empty hidden `span` carrying `.nsw-form__checkbox-label`, not by a second `<label>`. The
  system draws the box on the label after the input; a second label confuses the accessible name (axe `label` failures).
  The name comes from `aria-label` or the page's own label.
- **Tables take focus** (`tabindex="0"`): the system makes `.nsw-table` a scroll container on narrow screens, and a scroll
  container needs keyboard access (axe `scrollable-region-focusable`).
- **Panels** are local (`.mw-panel`), not `.nsw-card`, because cards are link blocks with hover effects.
- **Text colours.** The system ships fills and strokes but no text colour classes. Muted text uses `--nsw-grey-02`.
  Success, warning and error text uses the dark palette steps (`--nsw-palette-green-01`, `orange-01`, `red-01`), because the
  system's status colours fail WCAG AA as text on the pale status backgrounds (axe measured 4.02:1 for `#008a07` on
  `#e5f6e6`). Status labels use the system's own colours with white text, which pass.
- **`.nsw-border` is brand red**, so neutral borders use `--nsw-grey-03` through `.mw-border*`.
- **Headings** inside `main` without a system size class are scaled down (h1 1.5rem, h2 1.25rem, h3 and h4 1rem) because
  the system's h1 to h4 are display sizes (3rem to 1.5rem) and these are dense back-office pages. Page titles use `nsw-h3`.
- **"Find a page" (Ctrl K)** is a plain dialog list, not a command palette.
- **Print.** The system's print CSS hides the header and footer and removes backgrounds and colour. The header is kept
  hidden; the footer and notice are put back (see branding rule 3).
- **Charts** stay on Recharts, coloured from `--nsw-brand-dark`, `--nsw-grey-02`, `--nsw-status-warning`,
  `--nsw-status-success` and `--nsw-grey-01`, each with the table alternative (`ChartBox`) and direct labels or patterns
  as well as colour.

## Running it

```bash
cd web
npm install
npm run build          # type-check and build into web/dist
npm run dev            # Vite on :5173, /api proxied to http://localhost:8011
```

The backend serves `web/dist` and the API. For this variant it was run from this worktree on its own database:

```bash
METERWISE_DB=<worktree>/engine/var/nswds.db <repo>/.venv/Scripts/python run.py --port 8011
```

(Port 8001, the port first suggested, was already taken by another server on this machine, so 8011 was used; the Vite
proxy points at 8011.) The server no longer lists demo accounts, so the sign-in page has only the staff form, the MFA
step and the tenant access code. Scripts: `scripts/axe.mjs` (WCAG 2.2 AA sweep, desktop and `--mobile` at 320px, reflow
check; tenant access codes come from `GET /api/programme/projects/{id}/flats` as manager) and `scripts/e2e.mjs` (30 steps;
credentials from `E2E_PASSWORD` and `E2E_<ROLE>` with the seed emails as defaults). Selectors differ from the main branch
only where the markup does: selects are native, so `selectOption` replaces click-and-choose, and one status text match
tolerates the icon ligature text. The screenshot and print-emulation helpers used during the build were removed.

## Known gaps

- The MFA step of sign-in uses the same form components as the rest of sign-in but was not exercised against a live
  account with MFA switched on.
- Icon ligature text (for example `check_circle`) is part of an element's text content (it is hidden from assistive
  technology, but not from a text search or copy).
- Select options that are not plain text show their value instead of their label.
- Visual review was by screenshot on the priority screens only; the remaining pages were checked by axe, the 320px reflow
  check and the end-to-end walk, not by eye.

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { getToken } from '@/console/api'
import { PageHeader } from '@/portal/components/PageHeader'
import { LiveControls, NOT_CLAIMED } from '@/portal/components/Controls'

type Page = 'privacy' | 'accessibility' | 'terms' | 'trust'
const TITLE: Record<Page, string> = { privacy: 'Privacy notice', accessibility: 'Accessibility statement', terms: 'Terms of use', trust: 'Trust and security' }

function H({ children }: { children: ReactNode }) {
  return <h2 className="mw-mt-5 mw-text-lg nsw-text-semibold">{children}</h2>
}

export default function Legal({ page }: { page: Page }) {
  useEffect(() => {
    document.title = `${TITLE[page]} | Meterwise`
  }, [page])
  return (
    <article className="mw-max-w-3xl mw-space-y-2">
      <PageHeader crumbs={[{ label: 'Home', to: '/' }, { label: TITLE[page] }]} title={TITLE[page]} description="Meterwise is a prototype built for a hackathon. This page says what that means." />
      {page === 'privacy' && <Privacy />}
      {page === 'accessibility' && <Accessibility />}
      {page === 'terms' && <Terms />}
      {page === 'trust' && <Trust />}
    </article>
  )
}

function Privacy() {
  return (
    <>
      <p>All the people, organisations, addresses and meter readings in this prototype are examples made up for the demo. Please do not enter real personal information.</p>
      <H>What the service would collect if it were real</H>
      <ul className="mw-list-disc mw-space-y-1 mw-pl-5">
        <li>For tenants: a name and a flat number. Nothing about health, income or immigration status.</li>
        <li>For each flat: a meter identifier, monthly energy readings and the monthly charge.</li>
        <li>For staff: a name, an email address and an organisation.</li>
        <li>For enquiries from landlords and strata committees: the contact details you type in.</li>
      </ul>
      <H>How it is used</H>
      <p>Only to run the upgrade programme: working out charges, checking savings, answering faults and reporting results. Government, funder, installer and utility users never see tenant names or access codes.</p>
      <H>Your choices</H>
      <ul className="mw-list-disc mw-space-y-1 mw-pl-5">
        <li>Meter data is used only with the tenant's separate data consent. A tenant can give it, see when it ends and withdraw it.</li>
        <li>A tenant can ask for a copy of their data, or for their name to be replaced with "Former tenant". The charge record for the meter stays.</li>
      </ul>
      <H>What we have not done</H>
      <p>This prototype has not had a privacy impact assessment and has no privacy officer. A real service would need both, and would need to follow the NSW Privacy and Personal Information Protection Act and the Privacy Act where they apply.</p>
      <H>Cookies and trackers</H>
      <p>None. The service loads no third-party scripts, fonts or analytics. Your sign-in is kept in the browser tab's session storage and is cleared when you close the tab or sign out. The block finder map loads map tiles from an outside tile server.</p>
    </>
  )
}

function Accessibility() {
  return (
    <>
      <p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.</p>
      <H>What has been done</H>
      <ul className="mw-list-disc mw-space-y-1 mw-pl-5">
        <li>Every page can be used with a keyboard. Focus is always visible. There is a skip link on every page.</li>
        <li>Text meets a 4.5 to 1 contrast ratio. Input borders and focus rings meet 3 to 1.</li>
        <li>Buttons and links are at least 24 by 24 pixels.</li>
        <li>Pages work at a width of 320 pixels and at 400 percent zoom. Wide tables scroll inside their own labelled region.</li>
        <li>Forms have visible labels and say in words what is wrong. Status messages are announced to screen readers.</li>
        <li>Every chart has a "Show as table" switch. Status is never shown by colour alone.</li>
        <li>The typeface, Public Sans, is bundled with the service. Nothing loads from another site.</li>
      </ul>
      <H>What has not been done</H>
      <p>
        We have run an automated checker (axe) on the pages and walked the main paths by keyboard. We have <strong>not</strong> had a formal accessibility audit, and we have not tested with a range of screen readers or with people who use assistive technology. Some of the block finder (the older public tool) uses its own styles and has had less checking. The map is not fully usable without a mouse; the list beside it is the keyboard alternative.
      </p>
      <H>Tell us about a problem</H>
      <p>This is a prototype. A real service would give a contact address here and a time to respond.</p>
    </>
  )
}

function Terms() {
  return (
    <>
      <p>Meterwise is a screening and demonstration prototype. By using it you agree to the following.</p>
      <ul className="mw-list-disc mw-space-y-1 mw-pl-5">
        <li>Every figure is a modelled estimate, not a quote and not engineering or financial advice.</li>
        <li>Documents it produces are examples and are not legal advice. Do not sign or rely on them.</li>
        <li>The people, organisations and readings are examples. Simulated meter data is always labelled as simulated.</li>
        <li>Do not enter real personal information.</li>
        <li>The service is provided as it is, with no promise that it will be available or that data will be kept.</li>
      </ul>
    </>
  )
}

function Trust() {
  const signedIn = !!getToken()
  return (
    <>
      <p>This page says plainly what security and privacy controls the running system has, and what it does not have.</p>
      <H>What is switched on in this running system</H>
      {signedIn ? <LiveControls /> : <p className="mw-border mw-bg-white mw-p-4 mw-text-muted">The live list is read from the running server. Sign in to see it. The list of things we do not claim is below and applies either way.</p>}
      <H>Demo accounts</H>
      <p>While the demo is switched on, demo accounts do not need a second sign-in step, and a demo clock and reset exist. The live list above says whether that is the case right now. A real deployment turns all of that off.</p>
      <H>What we do not claim</H>
      <ul className="mw-list-disc mw-space-y-1 mw-pl-5">
        {NOT_CLAIMED.map((n) => (
          <li key={n}>No {n.charAt(0).toLowerCase() + n.slice(1)}</li>
        ))}
      </ul>
      <p className="mw-mt-2 mw-text-muted">The controls above were built to the kind of requirements a NSW council or agency would ask a supplier about. Building to a requirement is not the same as being assessed against it.</p>
    </>
  )
}

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { getToken } from '@/console/api'
import { PageHeader } from '@/portal/components/PageHeader'
import { LiveControls } from '@/portal/components/Controls'

type Page = 'privacy' | 'accessibility' | 'terms' | 'trust'
const TITLE: Record<Page, string> = { privacy: 'Privacy notice', accessibility: 'Accessibility statement', terms: 'Terms of use', trust: 'Trust and security' }
const DESCRIPTION: Record<Page, string> = {
  privacy: 'What Meterwise collects, why, who can see it, and the choices you have.',
  accessibility: 'How Meterwise is built and checked so that everyone can use it.',
  terms: 'The rules for using Meterwise.',
  trust: 'The controls that protect your information and the programme.',
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 text-lg font-semibold">{children}</h2>
}
function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>
}

export default function Legal({ page }: { page: Page }) {
  useEffect(() => {
    document.title = `${TITLE[page]} | Meterwise`
  }, [page])
  return (
    <article className="max-w-3xl space-y-2">
      <PageHeader crumbs={[{ label: 'Home', to: '/' }, { label: TITLE[page] }]} title={TITLE[page]} description={DESCRIPTION[page]} />
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
      <p>Meterwise helps councils and housing providers run upgrades to rented flats, repaid by a capped charge on each flat's meter. This notice explains how personal information is handled in the service.</p>
      <H>What we collect</H>
      <UL>
        <li>Tenants: a name and a unit number. Nothing about health, income or immigration status.</li>
        <li>Each flat: a meter reference, monthly energy readings, the monthly charge and the record of charges and payments.</li>
        <li>Staff and partner users: a name, an email address and the organisation they work for.</li>
        <li>Enquiries from landlords and strata committees: the contact details and block details typed into the form.</li>
      </UL>
      <H>Why we collect it</H>
      <p>Only to run the upgrade programme: working out and collecting charges, checking that savings are delivered, handling faults and tenancy changes, reporting results, and answering enquiries.</p>
      <H>Who can see it</H>
      <UL>
        <li>Tenant names and access codes are visible only to programme staff, the housing provider or owner of the block, and the tenant concerned.</li>
        <li>Utilities, government oversight users, funders and installers never see tenant names or access codes. Meter references are masked for government, funder and installer users.</li>
        <li>Every sign-in, export and change is recorded in an audit log.</li>
      </UL>
      <H>Meter data consent</H>
      <p>Using a flat's meter readings needs the tenant's separate consent. It is different from agreeing to the upgrade. A tenant can give or withdraw it at any time on the "My flat" page, and the page shows what it covers and when it ends.</p>
      <H>Your access and erasure rights</H>
      <p>You can ask for a copy of the personal information held about you, or ask for your name to be replaced with "Former tenant". The charge record for the meter is kept, because the funder needs it for its accounts. Ask your housing provider or programme officer, who can do this in the system.</p>
      <H>How long we keep it</H>
      <p>Charge and reading records are kept for the term of the charge plus the retention period set by the programme. Staff details are kept while the account is active. Enquiry details are kept for two years or until they are turned into a project. The Trust and security page shows the data inventory when you are signed in.</p>
      <H>Cookies, trackers and outside services</H>
      <p>Meterwise sets no cookies and loads no third-party scripts, fonts or analytics. Your sign-in is kept in the browser tab's session storage and is cleared when you close the tab or sign out. The only outside request is for map tiles from OpenStreetMap in the block finder, which tells OpenStreetMap the area of the map you are viewing.</p>
      <H>Questions and complaints</H>
      <p>Contact the programme officer at your housing provider or council. Their contact details are on the letter you received about the programme. If you are not satisfied with the response, you can complain to the NSW Information and Privacy Commission or the Office of the Australian Information Commissioner.</p>
    </>
  )
}

function Accessibility() {
  return (
    <>
      <p>Meterwise is built to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.</p>
      <H>What is in place</H>
      <UL>
        <li>Every page can be used with a keyboard. Focus is always visible and there is a skip link on every page.</li>
        <li>Text meets a contrast ratio of 4.5 to 1, and borders, controls and focus rings meet 3 to 1.</li>
        <li>Buttons, links and other controls are at least 24 by 24 pixels.</li>
        <li>Pages reflow at a width of 320 pixels and at 400 percent zoom. Wide tables scroll inside their own labelled region.</li>
        <li>Forms have visible labels and say in words what is wrong. Status messages are announced to screen readers.</li>
        <li>Every chart has a "Show as table" switch, and status is never shown by colour alone.</li>
        <li>The typeface, Public Sans, is served from this site. Nothing loads from another site except map tiles.</li>
      </UL>
      <H>How we check</H>
      <UL>
        <li>Automated checks with the axe accessibility engine run on every page in each release.</li>
        <li>We walk through the main tasks in each portal using only a keyboard.</li>
        <li>We check reflow at 320 pixels and zoom to 400 percent.</li>
        <li>Colour tokens are checked for contrast when they change.</li>
      </UL>
      <H>Known limitations</H>
      <UL>
        <li>We have not tested every page with every screen reader. Automated checks do not find every barrier.</li>
        <li>The map in the block finder is a visual aid. The table of blocks beside it does the same job and works with a keyboard.</li>
        <li>Documents open as web pages that you print or save as PDF from your browser. A saved PDF may lose some of the page structure that screen readers use.</li>
        <li>Charts have a table version, but the chart itself is an image to assistive technology.</li>
      </UL>
      <H>Report a barrier</H>
      <p>If you cannot use part of Meterwise, tell the programme officer at your housing provider or council. Their contact details are on the letter you received. Say which page you were on and what stopped you, and ask for the information in another format if you need it.</p>
    </>
  )
}

function Terms() {
  return (
    <>
      <p>By using Meterwise you agree to these terms.</p>
      <UL>
        <li>Figures are modelled estimates, not quotes. Actual bills, savings and costs will differ.</li>
        <li>Documents produced by the service summarise the programme's terms. They are not legal or financial advice. Please have your own adviser review them before you sign.</li>
        <li>Keep your sign-in details and tenant access codes private. Do not share them, and tell your programme officer if you think someone else has used them.</li>
        <li>Use the service only for the programme's purposes. Do not try to reach information or functions you have not been given access to, and do not upload anything that is unlawful or harmful.</li>
        <li>We work to keep the service available, but we do not promise it will always be available or error-free.</li>
        <li>Your use of personal information is covered by the <Link to="/privacy">privacy notice</Link>.</li>
      </UL>
    </>
  )
}

function Trust() {
  const signedIn = !!getToken()
  return (
    <>
      <p>Meterwise protects the information it holds with the controls below. The list under "Controls in place" is read live from the running service.</p>
      <H>Controls in place</H>
      {signedIn ? <LiveControls /> : <p className="border bg-card p-4 text-muted-foreground">The live list is shown when you are signed in. <Link to="/signin">Sign in</Link> to see it.</p>}
      <H>What the service does</H>
      <UL>
        <li>Sessions end after 12 hours, or after 30 minutes without activity. Signing out ends the session straight away.</li>
        <li>Staff sign in with a password and a second step. Passwords are stored as hashes, and repeated failed attempts lock the account for a time.</li>
        <li>Every request is checked against the person's role and organisation. Access is denied unless it has been given.</li>
        <li>The audit log is append-only and each entry carries the hash of the one before it, so changes to history can be detected.</li>
        <li>Responses carry security headers, including a strict content security policy.</li>
        <li>Tenant information is limited to a name and unit. Meter references are masked for roles that do not need them.</li>
        <li>Uploaded files are limited in size and rows, and exported files are protected against spreadsheet formula injection.</li>
      </UL>
      <p className="mt-2">Read the <Link to="/privacy">privacy notice</Link> and the <Link to="/accessibility">accessibility statement</Link> for more.</p>
    </>
  )
}

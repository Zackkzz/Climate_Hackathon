import { useEffect } from 'react'
import { Link } from 'react-router'
import type { OrgRef } from '@/console/types'

export function usePageTitle(t: string) {
  useEffect(() => {
    document.title = `${t} | Meterwise`
  }, [t])
}

export function ProjectLink({ id, label }: { id: number; label: string }) {
  return <Link to={`/government/projects/${id}`}>{label}</Link>
}

export const HEAT: Record<string, string> = { cooler: 'Cooler than most', average: 'About average', warm: 'A bit warmer', hot: 'Hotter than most', hottest: 'Among the hottest' }

/** Orgs that can own a block: housing providers, landlords and strata. Falls back to every non-installer org. */
export function ownerOrgs(orgs: OrgRef[]): OrgRef[] {
  const own = orgs.filter((o) => /provider|landlord|strata|community_housing|owner/i.test(o.kind ?? ''))
  return own.length ? own : orgs.filter((o) => !/installer|funder|programme|council|state|distributor|retailer|gas/i.test(o.kind ?? ''))
}

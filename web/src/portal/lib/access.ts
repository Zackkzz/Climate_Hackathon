import type { Role } from '@/console/types'

/** Which roles may open each portal. Used by route guards and the portal switcher. */
export const PORTALS: { key: string; label: string; to: string; roles: Role[] }[] = [
  { key: 'government', label: 'Government portal', to: '/government', roles: ['manager', 'government'] },
  { key: 'utility', label: 'Utility portal', to: '/utility', roles: ['utility', 'manager'] },
  { key: 'property', label: 'Property portal', to: '/property', roles: ['owner'] },
  { key: 'my-flat', label: 'My flat', to: '/property/my-flat', roles: ['tenant'] },
  { key: 'installer', label: 'Installer portal', to: '/installer', roles: ['installer', 'manager'] },
  { key: 'funder', label: 'Funder portal', to: '/funder', roles: ['funder', 'manager'] },
]

export const portalsFor = (role: Role) => PORTALS.filter((p) => p.roles.includes(role))
export const rolesFor = (key: string) => PORTALS.find((p) => p.key === key)?.roles ?? []

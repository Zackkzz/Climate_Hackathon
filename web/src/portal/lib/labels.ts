/** Plain labels for values the API sends. */
export function sourceLabel(source: string | null | undefined, serverLabel?: string | null): string {
  if (serverLabel) return serverLabel
  switch (source) {
    case 'simulated':
      return 'Modelled estimate'
    case 'uploaded':
      return 'Uploaded'
    case 'utility':
      return 'Utility'
    default:
      return source ?? '-'
  }
}

/** Strips any trailing "(example)" the data may carry, so it is never shown. */
export function cleanName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s*\((example|demo|sample)\)\s*$/i, '').replace(/\s*\(example [^)]*\)\s*$/i, '').trim()
}

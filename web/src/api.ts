import type {
  AssessRequest,
  AssessResponse,
  BuildingCollection,
  Meta,
  PortfolioRequest,
  PortfolioResponse,
} from './types'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, "We couldn't reach the Meterwise server. Check it is running, then try again.")
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiError(res.status, "We couldn't reach the Meterwise server. Check it is running, then try again.")
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body: unknown = await res.json()
      if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') detail = body.detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail || `The server had a problem (error ${res.status}). Please try again.`)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError(res.status, 'The server sent something we could not read. Please try again.')
  }
}

function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return http<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

/** Mock errors become ApiErrors so the UI treats them like real ones. */
async function mockCall<T>(fn: () => T, signal?: AbortSignal, ms = 180): Promise<T> {
  await wait(ms, signal)
  try {
    return fn()
  } catch (e) {
    if (e instanceof Error && 'status' in e && typeof e.status === 'number') throw new ApiError(e.status, e.message)
    throw e
  }
}

export async function getMeta(): Promise<Meta> {
  if (USE_MOCK) {
    const m = await import('./mock/fixtures')
    return mockCall(() => m.mockMeta, undefined, 120)
  }
  return http<Meta>('/api/meta')
}

export async function getBuildings(): Promise<BuildingCollection> {
  if (USE_MOCK) {
    const m = await import('./mock/fixtures')
    return mockCall(() => m.mockBuildings, undefined, 200)
  }
  return http<BuildingCollection>('/api/buildings')
}

export async function assess(req: AssessRequest, signal?: AbortSignal): Promise<AssessResponse> {
  if (USE_MOCK) {
    const m = await import('./mock/assess')
    return mockCall(() => m.mockAssess(req), signal, 150)
  }
  return postJson<AssessResponse>('/api/assess', req, signal)
}

export async function portfolio(req: PortfolioRequest, signal?: AbortSignal): Promise<PortfolioResponse> {
  if (USE_MOCK) {
    const m = await import('./mock/assess')
    return mockCall(() => m.mockPortfolio(req), signal, 200)
  }
  return postJson<PortfolioResponse>('/api/portfolio', req, signal)
}

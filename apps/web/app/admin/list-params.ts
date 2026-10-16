import type { ListOptions } from '@/lib/server/listing'

/** Search params as Next.js passes them to a page. */
export type RawParams = Record<string, string | string[] | undefined>
/** Search params flattened to one value each, empty ones dropped. */
export type Params = Record<string, string>

export function cleanParams(sp: RawParams): Params {
  const out: Params = {}
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v
    if (value) out[k] = value
  }
  return out
}

/**
 * Paging and sorting for one list. `prefix` keeps two lists on one page apart (`rpage`, `rsort`);
 * the page size is shared by every admin list.
 */
export function listOptions(params: Params, prefix = ''): ListOptions {
  return {
    page: Number(params[`${prefix}page`]) || 1,
    perPage: Number(params.per) || undefined,
    sort: params[`${prefix}sort`],
    dir: params[`${prefix}dir`],
  }
}

/** The current address with some parameters changed (`undefined` removes one). */
export function hrefWith(
  path: string,
  params: Params,
  changes: Record<string, string | undefined>,
) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...params, ...changes })) if (v) sp.set(k, v)
  const qs = sp.toString()
  return qs ? `${path}?${qs}` : path
}

/** Page numbers reset whenever the search, sort or page size changes. */
export const isPageKey = (key: string) => key === 'page' || key.endsWith('page')

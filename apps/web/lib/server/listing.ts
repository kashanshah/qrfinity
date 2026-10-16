import { asc, sql, type SQL } from '@qrfinity/db'

/**
 * Paging and sorting for admin lists. Each list names the columns it can be sorted by; anything
 * else in the address falls back to the list's default, so a hand-edited URL can't inject SQL or
 * break the page.
 */

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PER_PAGE = 25

export type SortDir = 'asc' | 'desc'
/** Anything `ORDER BY` accepts: a column or an SQL expression. */
export type Orderable = Parameters<typeof asc>[0]

export type ListOptions = {
  page?: number
  perPage?: number
  sort?: string
  dir?: string
}

export type Paged<T, K extends string = string> = {
  rows: T[]
  total: number
  page: number
  pages: number
  perPage: number
  sort: K
  dir: SortDir
}

/** Clamps a requested page size to one of the allowed options. */
export function perPageFrom(value: unknown): number {
  const n = Number(value)
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PER_PAGE
}

/** Sorts text the way people expect: "alpha" before "Beta", whatever the database collation. */
export const lower = (col: Orderable) => sql`lower(${col})`

/** `%term%` for ILIKE, with the user's own `%`, `_` and `\` matched literally. */
export function likePattern(term: string) {
  return `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`
}

export async function paged<T, K extends string>(
  opts: ListOptions,
  spec: {
    /** Sort keys the list accepts, mapped to what they order by. */
    sorts: Record<K, Orderable>
    defaultSort: NoInfer<K>
    defaultDir: SortDir
    /** A unique column, so rows with equal sort values keep a stable order across pages. */
    tiebreak: Orderable
    count: () => Promise<number>
    rows: (orderBy: SQL[], limit: number, offset: number) => PromiseLike<T[]>
  },
): Promise<Paged<T, K>> {
  const known =
    opts.sort !== undefined && Object.prototype.hasOwnProperty.call(spec.sorts, opts.sort)
  const sort = (known ? opts.sort : spec.defaultSort) as K
  const dir: SortDir =
    opts.dir === 'asc' || opts.dir === 'desc'
      ? opts.dir
      : sort === spec.defaultSort
        ? spec.defaultDir
        : 'asc'
  const perPage = perPageFrom(opts.perPage)
  const requested = Math.max(1, Math.floor(Number(opts.page) || 1))
  // Empty values sort last in both directions, so blanks never crowd the top of a list.
  const order = (by: Orderable) => sql`${by} ${sql.raw(dir)} nulls last`
  const orderBy = [order(spec.sorts[sort]), order(spec.tiebreak)]
  const load = (p: number) => spec.rows(orderBy, perPage, (p - 1) * perPage)
  // Count and rows together: one round trip to the database instead of two.
  const [total, firstTry] = await Promise.all([spec.count(), load(requested)])
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(requested, pages)
  // Only a page past the end (an old link after deletions) needs a second fetch.
  const rows = page === requested ? firstTry : await load(page)
  return { rows, total, page, pages, perPage, sort, dir }
}

import { PER_PAGE_OPTIONS } from '@/lib/server/listing'
import type { Params } from './list-params'
import { Pagination } from './Pagination'
import { PerPageSelect } from './PerPageSelect'

/** Above a list: "Showing 1–25 of 61", previous/next, and the page size. */
export function ListBar(props: {
  path: string
  params: Params
  prefix?: string
  page: number
  pages: number
  perPage: number
  total: number
  noun: string
  /** Leave out when another list on the page already shows the page size. */
  perPageSelect?: boolean
}) {
  const { perPageSelect = true, ...pagination } = props
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Pagination {...pagination} />
      {perPageSelect ? <PerPageSelect value={props.perPage} options={PER_PAGE_OPTIONS} /> : null}
    </div>
  )
}

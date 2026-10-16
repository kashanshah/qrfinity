import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'
import { hrefWith, type Params } from './list-params'
import { th } from './table'

/**
 * A column header that sorts the list. Clicking the sorted column flips the direction; another
 * column starts in its natural direction (newest or largest first for dates and counts).
 */
export function SortHeader({
  label,
  sortKey,
  current,
  path,
  params,
  prefix = '',
  firstDir = 'asc',
  className = '',
}: {
  label: string
  sortKey: string
  current: { sort: string; dir: 'asc' | 'desc' }
  path: string
  params: Params
  prefix?: string
  firstDir?: 'asc' | 'desc'
  className?: string
}) {
  const active = current.sort === sortKey
  const next = active ? (current.dir === 'asc' ? 'desc' : 'asc') : firstDir
  const href = hrefWith(path, params, {
    [`${prefix}sort`]: sortKey,
    [`${prefix}dir`]: next,
    [`${prefix}page`]: undefined,
  })
  const Icon = !active ? ArrowUpDown : current.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`${th} ${className}`}
    >
      <Link
        href={href}
        className={`inline-flex items-center gap-1 rounded-sm hover:text-ink ${active ? 'font-bold text-ink' : ''}`}
      >
        {label}
        <Icon
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className={active ? 'text-evergreen' : 'opacity-50'}
        />
        <span className="sr-only">
          {active
            ? `, sorted ${current.dir === 'asc' ? 'ascending' : 'descending'}. Sort ${next === 'asc' ? 'ascending' : 'descending'}`
            : `. Sort ${next === 'asc' ? 'ascending' : 'descending'}`}
        </span>
      </Link>
    </th>
  )
}

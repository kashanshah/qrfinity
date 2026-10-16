import { isPageKey, type Params } from './list-params'

/** A GET search box that keeps the current sort and page size, and goes back to page 1. */
export function SearchForm({
  path,
  params,
  label,
  placeholder,
}: {
  path: string
  params: Params
  label: string
  placeholder: string
}) {
  const keep = Object.entries(params).filter(([k]) => k !== 'q' && !isPageKey(k))
  return (
    <form className="flex gap-2" action={path} role="search">
      <label htmlFor="q" className="sr-only">
        {label}
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={params.q ?? ''}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2.5 text-ink"
      />
      {keep.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink">
        Search
      </button>
    </form>
  )
}

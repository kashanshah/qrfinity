/**
 * Shown the moment an admin link is clicked, while the server renders the page. Admin pages are
 * always rendered fresh, so without this the old page would sit unchanged until the new one is ready.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-48 motion-safe:animate-pulse rounded-md bg-surface-sunk" />
      <div className="h-11 w-full motion-safe:animate-pulse rounded-md bg-surface-sunk" />
      <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-6 motion-safe:animate-pulse rounded-sm bg-surface-sunk" />
        ))}
      </div>
    </div>
  )
}

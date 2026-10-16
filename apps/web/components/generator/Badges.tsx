import { Check, Infinity as InfinityIcon, LoaderCircle, TriangleAlert } from 'lucide-react'

export function CodeTypeBadge({ type }: { type: 'static' | 'dynamic' }) {
  return type === 'static' ? (
    <span className="label inline-flex items-center rounded-pill border-[1.5px] border-control-border bg-surface px-3 py-1 text-ink">
      Static
    </span>
  ) : (
    <span className="label inline-flex items-center rounded-pill bg-evergreen px-3 py-1 text-on-evergreen">
      Dynamic
    </span>
  )
}

export function NeverExpiresBadge() {
  return (
    <span className="label inline-flex items-center gap-1 rounded-pill bg-mint px-3 py-1 font-bold text-ink">
      <InfinityIcon aria-hidden="true" size={16} strokeWidth={1.75} />
      Never expires
    </span>
  )
}

export type ScanBadgeState = 'checking' | 'pass' | 'fail'

export function ScanBadge({ state }: { state: ScanBadgeState }) {
  if (state === 'checking') {
    return (
      <span className="label inline-flex items-center gap-1 rounded-pill border-[1.5px] border-hairline bg-surface px-3 py-1 text-ink-muted">
        <LoaderCircle
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className="animate-spin motion-reduce:animate-none"
        />
        Checking
      </span>
    )
  }
  return state === 'pass' ? (
    <span className="label inline-flex items-center gap-1 rounded-pill bg-scan-pass px-3 py-1 font-bold text-on-scan-pass">
      <Check aria-hidden="true" size={16} strokeWidth={2} />
      Scans
    </span>
  ) : (
    <span className="label inline-flex items-center gap-1 rounded-pill bg-scan-fail px-3 py-1 font-bold text-on-scan-fail">
      <TriangleAlert aria-hidden="true" size={16} strokeWidth={1.75} />
      Won’t scan
    </span>
  )
}

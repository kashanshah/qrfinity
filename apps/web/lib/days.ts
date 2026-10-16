/** Allowed analytics ranges, from the ?days= search parameter. Defaults to 30. */
export function parseDays(v: string | undefined, allowed: readonly number[] = [7, 30, 90]): number {
  const n = Number(v)
  return allowed.includes(n) ? n : 30
}

export function rangeLabel(days: number): string {
  if (days === 365) return 'Last year'
  if (days === 730) return 'Last 2 years'
  return `Last ${days} days`
}

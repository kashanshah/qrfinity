/** Allowed analytics ranges, from the ?days= search parameter. */
export function parseDays(v: string | undefined): number {
  const n = Number(v)
  return [7, 30, 90].includes(n) ? n : 30
}

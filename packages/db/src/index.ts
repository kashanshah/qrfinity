export * from './client'
export * from './schema'
export { runMigrations } from './migrate'
// Query helpers, re-exported so apps share this package's single drizzle-orm instance.
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

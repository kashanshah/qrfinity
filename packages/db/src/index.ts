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
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

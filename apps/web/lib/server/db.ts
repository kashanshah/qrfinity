import { createDb, type Database } from '@qrfinity/db'
import { env } from './env'

const g = globalThis as unknown as { __qrfinityDb?: Database }

/** One connection pool per server process (reused across hot reloads in development). */
export function getDb(): Database {
  g.__qrfinityDb ??= createDb(env.databaseUrl, { max: 5 })
  return g.__qrfinityDb
}

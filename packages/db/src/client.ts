import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = ReturnType<typeof createDb>

/**
 * Creates a Drizzle client over postgres.js. `prepare: false` keeps it compatible with
 * transaction-mode poolers (Neon's pooled endpoint, PgBouncer, Hyperdrive).
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 5,
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {},
  })
  return Object.assign(drizzle(client, { schema }), { $client: client })
}

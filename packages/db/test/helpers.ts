import { sql } from 'drizzle-orm'
import { createDb, runMigrations } from '../src'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://qrfinity:qrfinity@localhost:5432/qrfinity_test'

/** Drops everything in the test database and re-applies migrations. */
export async function resetTestDb() {
  const db = createDb(TEST_DATABASE_URL, { max: 1 })
  await db.execute(
    sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`,
  )
  await db.$client.end()
  await runMigrations(TEST_DATABASE_URL)
  return createDb(TEST_DATABASE_URL)
}

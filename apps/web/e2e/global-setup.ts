import { createDb, runMigrations, sql } from '@qrfinity/db'
import { E2E_DB } from '../playwright.config'

/** Fresh schema for every run. The app and Workers connect lazily, so this is safe after they start. */
export default async function globalSetup() {
  const db = createDb(E2E_DB, { max: 1 })
  await db.execute(
    sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`,
  )
  await db.$client.end()
  await runMigrations(E2E_DB)
}

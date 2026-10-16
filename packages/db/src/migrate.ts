import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from './client'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

/** First existing file that defines DATABASE_URL is used. An already-set variable wins. */
const ENV_FILES = [
  '.env.local',
  '.env',
  'apps/.env.local',
  'apps/.env',
  'apps/web/.env.local',
  'apps/web/.env',
]

/** Applies pending migrations. Used by `pnpm db:migrate`, tests and deploys. */
export async function runMigrations(url: string) {
  const db = createDb(url, { max: 1 })
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    })
  } finally {
    await db.$client.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Fall back to a local env file, so `pnpm db:migrate` just works in development.
  if (!process.env.DATABASE_URL) {
    for (const file of ENV_FILES) {
      const path = join(repoRoot, file)
      if (!existsSync(path)) continue
      process.loadEnvFile(path)
      if (process.env.DATABASE_URL) {
        console.log(`Using DATABASE_URL from ${relative(repoRoot, path)}`)
        break
      }
    }
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error(
      "DATABASE_URL isn't set. Run it with your database's connection string, for example:\n" +
        "  DATABASE_URL='postgresql://user:password@host/db?sslmode=require' pnpm db:migrate",
    )
    process.exit(1)
  }
  await runMigrations(url)
  console.log(`Migrations applied to ${new URL(url).host}.`)
}

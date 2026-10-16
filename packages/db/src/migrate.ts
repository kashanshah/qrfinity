import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDb } from './client'

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
  // Fall back to the web app's local env file, so `pnpm db:migrate` just works in development.
  const localEnv = fileURLToPath(new URL('../../../apps/web/.env.local', import.meta.url))
  if (!process.env.DATABASE_URL && existsSync(localEnv)) {
    process.loadEnvFile(localEnv)
    console.log('Using DATABASE_URL from apps/web/.env.local')
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

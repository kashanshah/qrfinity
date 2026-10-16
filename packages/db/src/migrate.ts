import { migrate } from 'drizzle-orm/postgres-js/migrator'
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
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL')
  await runMigrations(url)
  console.log('Migrations applied.')
}

// Тест-БД для интеграционных тестов ручек: PGlite (in-memory Postgres) с той же схемой, что и прод.
// Драйвер прода — Neon HTTP, к нему не подключить локальный Postgres, а живой Neon в тестах гонять
// нельзя. PGlite даёт реальный SQL (каскады, UNIQUE, enum, дедлайн) полностью офлайн.
// В тестах этот testDb подменяет @/lib/db через vi.mock — хендлеры работают с ним как есть.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/lib/db/schema';

const client = new PGlite();
export const testDb = drizzle(client, { schema });

// Прогоняем существующие миграции drizzle один раз на инстанс.
let schemaReady: Promise<unknown> | null = null;
export function ensureSchema(): Promise<unknown> {
  schemaReady ??= migrate(testDb, { migrationsFolder: './drizzle' });
  return schemaReady;
}

// Чистим между тестами: удаление решений каскадом уносит options/participants/rankings.
export async function truncateAll(): Promise<void> {
  await testDb.delete(schema.decisions);
}

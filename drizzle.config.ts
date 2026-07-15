import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Секрет DATABASE_URL живёт в .env.local (в .gitignore), а не в .env — грузим его явно.
config({ path: '.env.local' });

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

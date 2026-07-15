import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// На Vercel (serverless) подключаемся к Neon только через HTTP-драйвер —
// обычный TCP-`pg` исчерпал бы лимит соединений. См. PLAN.md, раздел 4.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL не задан. Скопируй .env.example в .env.local и вставь строку подключения Neon.',
  );
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

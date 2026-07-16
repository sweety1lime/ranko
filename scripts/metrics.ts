// Метрики успеха первых недель (PLAN.md §8, Фаза 6): сколько решений создано, % решений
// с ≥ 3 проголосовавшими, % доведённых до «закрыто». Запуск: npm run metrics.
//
// Почему скриптом по базе, а не внешним счётчиком: эти метрики — про судьбу конкретного решения
// («в скольких из них набралось трое?»), из визитов и pageview-ов такое не собрать в принципе.
// Поэтому сторонней аналитики в проекте нет вовсе, а вопрос «работает ли продукт» закрывается
// отсюда. Скрипт только читает: ничего не меняет и не закрывает.
import { config } from 'dotenv';

// Как и в seed.ts: DATABASE_URL лежит в .env.local, а клиент БД проверяет env прямо на импорте —
// поэтому грузим окружение первым, а всё остальное подключаем динамически внутри main().
config({ path: '.env.local' });

function percent(part: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((part / total) * 100)}% (${part} из ${total})`;
}

async function main() {
  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db');
  const { decisions, participants, rankings } = await import('../src/lib/db/schema');

  // Одним запросом: строка на решение + сколько человек в нём реально проголосовало.
  // «Проголосовал» = есть ранжировки, а не просто присоединился: участник заводится при первой
  // отправке, и если она не дошла до PUT, запись останется без голоса. Ровно так же считает
  // votedNames на странице результатов (src/lib/results.ts) — метрика и продукт говорят об одном.
  const rows = await db
    .select({
      status: decisions.status,
      deadline: decisions.deadline,
      voters: sql<number>`count(distinct ${rankings.participantId})`.mapWith(Number),
    })
    .from(decisions)
    .leftJoin(participants, eq(participants.decisionId, decisions.id))
    .leftJoin(rankings, eq(rankings.participantId, participants.id))
    .groupBy(decisions.id);

  const now = Date.now();
  const total = rows.length;
  const engaged = rows.filter((row) => row.voters >= 3).length;
  // Закрытие по дедлайну ленивое (PLAN.md §5): решение с прошедшим дедлайном закрыто по сути,
  // даже если в базе всё ещё 'open' — его просто никто не открывал с тех пор. Считаем по сути,
  // но статус не переписываем: метрики не должны менять данные, которые измеряют.
  const closed = rows.filter(
    (row) => row.status === 'closed' || (row.deadline !== null && row.deadline.getTime() <= now),
  ).length;

  console.log('Метрики Ranko (PLAN.md §8)');
  console.log(`  Создано решений:              ${total}`);
  console.log(`  Где проголосовали ≥ 3 человек: ${percent(engaged, total)}`);
  console.log(`  Доведено до «закрыто»:        ${percent(closed, total)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Метрики не собрались:', err);
    process.exit(1);
  });

// Seed-скрипт: наполняет БД одним демо-решением (PLAN.md, Фаза 1). Запуск: npm run db:seed.
// Идемпотентен — повторный запуск заменяет демо-решение с тем же slug.
import { config } from 'dotenv';

// Секрет DATABASE_URL лежит в .env.local — грузим его ДО импорта клиента БД (он проверяет env
// на импорте), поэтому клиент, схему и алгоритм подключаем динамически внутри main().
config({ path: '.env.local' });

// Стабильный slug демо-решения: даёт постоянную ссылку и делает повторный seed idempotent.
const DEMO_SLUG = 'demo-fri';

async function main() {
  const { eq } = await import('drizzle-orm');
  const { nanoid } = await import('nanoid');
  const { db } = await import('./index');
  const { decisions, options, participants, rankings } = await import('./schema');
  const { computeResults } = await import('../borda');

  // Сносим прошлое демо (cascade уберёт варианты/участников/ранжировки).
  await db.delete(decisions).where(eq(decisions.slug, DEMO_SLUG));

  const adminToken = nanoid(24);
  const [decision] = await db
    .insert(decisions)
    .values({
      slug: DEMO_SLUG,
      adminToken,
      title: 'Куда идём в пятницу?',
      description: 'Выбираем место для вечера. Перетащи варианты в порядок предпочтения.',
    })
    .returning();

  const labels = ['Пиццерия на углу', 'Новый бар у реки', 'Домашние настолки', 'Кино в центре'];
  const insertedOptions = await db
    .insert(options)
    .values(labels.map((label, position) => ({ decisionId: decision.id, label, position })))
    .returning();

  // Бюллетени: order — индексы вариантов в порядке предпочтения (0-й = самый желанный).
  const ballots: { name: string; order: number[] }[] = [
    { name: 'Аня', order: [0, 1, 3, 2] },
    { name: 'Борис', order: [1, 0, 2, 3] },
    { name: 'Вера', order: [0, 3, 1, 2] },
  ];

  const bordaRankings: { participantId: string; optionId: string; rank: number }[] = [];
  for (const b of ballots) {
    const [participant] = await db
      .insert(participants)
      .values({ decisionId: decision.id, name: b.name, token: nanoid(24) })
      .returning();

    const rows = b.order.map((optionIndex, rank) => ({
      participantId: participant.id,
      optionId: insertedOptions[optionIndex].id,
      rank,
    }));
    await db.insert(rankings).values(rows);
    bordaRankings.push(...rows);
  }

  // Прогоняем алгоритм на реальных данных — проверка, что схема и borda.ts согласованы end-to-end.
  const result = computeResults(
    insertedOptions.map((o) => ({ id: o.id, label: o.label })),
    bordaRankings,
    DEMO_SLUG,
  );
  const winner = insertedOptions.find((o) => o.id === result.winnerId);

  console.log('Демо-решение создано.');
  console.log(`  Публичная ссылка: /d/${DEMO_SLUG}`);
  console.log(`  Админ-ссылка:     /d/${DEMO_SLUG}/admin?token=${adminToken}`);
  console.log(`  Вариантов: ${insertedOptions.length}, участников: ${ballots.length}`);
  console.log(`  Текущий победитель: ${winner ? winner.label : '—'}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed упал:', err);
    process.exit(1);
  });

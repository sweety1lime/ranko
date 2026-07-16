// DB-хелперы вокруг таблицы decisions: ленивое закрытие по дедлайну и генерация уникального slug.
// Держим их отдельно от route handlers, чтобы хендлеры оставались тонкими.
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { decisions, type Decision } from '@/lib/db/schema';

// Грузит решение по slug и лениво закрывает его, если прошёл дедлайн (PLAN.md §5): любой read/write
// при now > deadline сначала переводит статус в 'closed'. Возвращает решение (уже с актуальным
// статусом) или null, если такого slug нет.
export async function getDecisionBySlug(slug: string): Promise<Decision | null> {
  const [decision] = await db.select().from(decisions).where(eq(decisions.slug, slug)).limit(1);
  if (!decision) return null;

  if (decision.status === 'open' && decision.deadline && decision.deadline.getTime() <= Date.now()) {
    await db.update(decisions).set({ status: 'closed' }).where(eq(decisions.id, decision.id));
    return { ...decision, status: 'closed' };
  }

  return decision;
}

// Генерирует slug (nanoid 10 символов) и проверяет отсутствие коллизии. Коллизия на таком алфавите
// практически невозможна, но пара повторов дешевле, чем 500 у пользователя.
export async function generateUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = nanoid(10);
    const [existing] = await db
      .select({ id: decisions.id })
      .from(decisions)
      .where(eq(decisions.slug, slug))
      .limit(1);
    if (!existing) return slug;
  }
  throw new Error('Не удалось сгенерировать уникальный slug');
}

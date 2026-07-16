// DB-хелперы вокруг таблицы decisions: ленивое закрытие по дедлайну и генерация уникального slug.
// Держим их отдельно от route handlers, чтобы хендлеры оставались тонкими.
import { asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { decisions, options, participants, type Decision } from '@/lib/db/schema';

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

// Публичное представление решения: то, что можно показать любому по ссылке. Ровно эту форму отдаёт
// GET /api/decisions/{slug} и на ней же рендерится страница голосования — оба читают через
// getDecisionView, поэтому расходиться им негде.
export type DecisionView = {
  slug: string;
  title: string;
  description: string | null;
  // Город и место — публичные данные: их для того и заводили, чтобы участник увидел, куда идти.
  city: string | null;
  status: Decision['status'];
  deadline: Date | null;
  createdAt: Date;
  options: { id: string; label: string; place: string | null; position: number }[];
  participants: { id: string; name: string }[];
};

// Собирает публичное представление решения или null, если slug неизвестен. Статус приходит из
// getDecisionBySlug уже актуальным (ленивое закрытие по дедлайну, PLAN.md §5).
// Токены — admin_token решения и token участника — здесь не выбираются намеренно (PLAN.md §4).
export async function getDecisionView(slug: string): Promise<DecisionView | null> {
  const decision = await getDecisionBySlug(slug);
  if (!decision) return null;

  const [opts, parts] = await Promise.all([
    db
      .select({
        id: options.id,
        label: options.label,
        place: options.place,
        position: options.position,
      })
      .from(options)
      .where(eq(options.decisionId, decision.id))
      .orderBy(asc(options.position)),
    db
      .select({ id: participants.id, name: participants.name })
      .from(participants)
      .where(eq(participants.decisionId, decision.id))
      .orderBy(asc(participants.createdAt)),
  ]);

  return {
    slug: decision.slug,
    title: decision.title,
    description: decision.description,
    city: decision.city,
    status: decision.status,
    deadline: decision.deadline,
    createdAt: decision.createdAt,
    options: opts,
    participants: parts,
  };
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

// PUT /api/decisions/{slug}/vote — участник задаёт полный порядок вариантов (PLAN.md §6).
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { options, participants, rankings } from '@/lib/db/schema';
import { apiError, json, readJson } from '@/lib/api';
import { getDecisionBySlug } from '@/lib/decisions';
import { readParticipantCookie } from '@/lib/participant-cookie';
import { voteSchema } from '@/lib/schemas';

type Params = { params: Promise<{ slug: string }> };

export async function PUT(req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const parsed = await readJson(req, voteSchema);
  if (!parsed.ok) return parsed.response;
  const { order } = parsed.data;

  const decision = await getDecisionBySlug(slug);
  if (!decision) return apiError('Решение не найдено', 404);
  if (decision.status === 'closed') return apiError('Голосование закрыто', 403);

  // Личность: токен из тела (обычный путь — он есть в localStorage), иначе httpOnly-cookie дублем
  // (PLAN.md §4) — единственный источник, когда localStorage вычистили. Cookie привязана к slug,
  // поэтому чужое решение ею не открыть.
  const participantToken = parsed.data.participantToken ?? readParticipantCookie(req, slug);
  if (!participantToken) return apiError('Отсутствует токен участника', 403);

  const [participant] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.decisionId, decision.id), eq(participants.token, participantToken)))
    .limit(1);
  if (!participant) return apiError('Неверный токен участника', 403);

  const opts = await db
    .select({ id: options.id })
    .from(options)
    .where(eq(options.decisionId, decision.id));
  const optionIds = new Set(opts.map((o) => o.id));

  // order обязан быть перестановкой ровно всех вариантов решения: та же длина, без дублей, тот же набор.
  const isPermutation =
    order.length === optionIds.size &&
    new Set(order).size === order.length &&
    order.every((id) => optionIds.has(id));
  if (!isPermutation) return apiError('Нужно ранжировать все варианты ровно по одному разу', 422);

  // Замена голоса: сносим прежние ранжировки участника и вставляем новые (rank = позиция в order,
  // 0 = самый желанный). Делаем двумя запросами последовательно: драйвер Neon HTTP не поддерживает
  // интерактивные транзакции. Окно неатомарности крошечное и самоизлечимое — повторная отправка чинит.
  await db.delete(rankings).where(eq(rankings.participantId, participant.id));
  await db
    .insert(rankings)
    .values(order.map((optionId, rank) => ({ participantId: participant.id, optionId, rank })));

  return json({ ok: true });
}

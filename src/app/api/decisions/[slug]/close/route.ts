// POST /api/decisions/{slug}/close — админ закрывает голосование досрочно (PLAN.md §2, §6).
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { decisions } from '@/lib/db/schema';
import { apiError, json, readJson, tokensEqual } from '@/lib/api';
import { getDecisionBySlug } from '@/lib/decisions';
import { adminActionSchema } from '@/lib/schemas';

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const parsed = await readJson(req, adminActionSchema);
  if (!parsed.ok) return parsed.response;

  const decision = await getDecisionBySlug(slug);
  if (!decision) return apiError('Решение не найдено', 404);
  if (!tokensEqual(parsed.data.adminToken, decision.adminToken)) {
    return apiError('Неверный админ-токен', 403);
  }

  // Идемпотентно: повторное закрытие уже закрытого решения — не ошибка.
  if (decision.status === 'open') {
    await db.update(decisions).set({ status: 'closed' }).where(eq(decisions.id, decision.id));
  }

  return json({ status: 'closed' });
}

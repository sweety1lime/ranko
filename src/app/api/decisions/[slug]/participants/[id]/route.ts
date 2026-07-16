// DELETE /api/decisions/{slug}/participants/{id} — админ удаляет участника (спам/дубль, PLAN.md §2).
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { participants } from '@/lib/db/schema';
import { apiError, json, readJson, tokensEqual } from '@/lib/api';
import { getDecisionBySlug } from '@/lib/decisions';
import { adminActionSchema } from '@/lib/schemas';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ slug: string; id: string }> };

export async function DELETE(req: Request, { params }: Params): Promise<Response> {
  const { slug, id } = await params;
  const parsed = await readJson(req, adminActionSchema);
  if (!parsed.ok) return parsed.response;

  const decision = await getDecisionBySlug(slug);
  if (!decision) return apiError('Решение не найдено', 404);
  if (!tokensEqual(parsed.data.adminToken, decision.adminToken)) {
    return apiError('Неверный админ-токен', 403);
  }

  // Некорректный id не отдаём в БД (иначе ошибка приведения к uuid) — сразу 404.
  if (!UUID_RE.test(id)) return apiError('Участник не найден', 404);

  const deleted = await db
    .delete(participants)
    .where(and(eq(participants.id, id), eq(participants.decisionId, decision.id)))
    .returning({ id: participants.id });
  if (deleted.length === 0) return apiError('Участник не найден', 404);

  return json({ ok: true });
}

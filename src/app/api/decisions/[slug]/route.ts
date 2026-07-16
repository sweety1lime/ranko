// GET /api/decisions/{slug}    — публичное чтение решения (без admin_token и чужих токенов).
// DELETE /api/decisions/{slug} — админ удаляет решение (cascade уберёт варианты/участников/голоса).
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { decisions } from '@/lib/db/schema';
import { apiError, json, readJson, tokensEqual } from '@/lib/api';
import { getDecisionBySlug, getDecisionView } from '@/lib/decisions';
import { adminActionSchema } from '@/lib/schemas';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const view = await getDecisionView(slug);
  if (!view) return apiError('Решение не найдено', 404);
  return json(view);
}

export async function DELETE(req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const parsed = await readJson(req, adminActionSchema);
  if (!parsed.ok) return parsed.response;

  const decision = await getDecisionBySlug(slug);
  if (!decision) return apiError('Решение не найдено', 404);
  if (!tokensEqual(parsed.data.adminToken, decision.adminToken)) {
    return apiError('Неверный админ-токен', 403);
  }

  await db.delete(decisions).where(eq(decisions.id, decision.id));
  return json({ ok: true });
}

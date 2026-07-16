// GET /api/decisions/{slug}    — публичное чтение решения (без admin_token и чужих токенов).
// DELETE /api/decisions/{slug} — админ удаляет решение (cascade уберёт варианты/участников/голоса).
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { decisions, options, participants } from '@/lib/db/schema';
import { apiError, json, readJson, tokensEqual } from '@/lib/api';
import { getDecisionBySlug } from '@/lib/decisions';
import { adminActionSchema } from '@/lib/schemas';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const decision = await getDecisionBySlug(slug);
  if (!decision) return apiError('Решение не найдено', 404);

  const [opts, parts] = await Promise.all([
    db
      .select({ id: options.id, label: options.label, position: options.position })
      .from(options)
      .where(eq(options.decisionId, decision.id))
      .orderBy(asc(options.position)),
    // Имена участников — публичны; token намеренно не выбираем (PLAN.md §4).
    db
      .select({ id: participants.id, name: participants.name })
      .from(participants)
      .where(eq(participants.decisionId, decision.id))
      .orderBy(asc(participants.createdAt)),
  ]);

  return json({
    slug: decision.slug,
    title: decision.title,
    description: decision.description,
    status: decision.status,
    deadline: decision.deadline,
    createdAt: decision.createdAt,
    options: opts,
    participants: parts,
  });
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

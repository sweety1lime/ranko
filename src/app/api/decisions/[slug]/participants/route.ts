// POST /api/decisions/{slug}/participants — участник присоединяется к голосованию (PLAN.md §6).
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { participants } from '@/lib/db/schema';
import { apiError, json, readJson } from '@/lib/api';
import { getDecisionBySlug } from '@/lib/decisions';
import { joinSchema } from '@/lib/schemas';

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const parsed = await readJson(req, joinSchema);
  if (!parsed.ok) return parsed.response;

  const decision = await getDecisionBySlug(slug);
  if (!decision) return apiError('Решение не найдено', 404);
  if (decision.status === 'closed') return apiError('Голосование закрыто', 403);

  const token = nanoid(24);
  const [participant] = await db
    .insert(participants)
    .values({ decisionId: decision.id, name: parsed.data.name, token })
    .returning({ id: participants.id });

  // participantToken отдаём только владельцу здесь; в GET-ответах он не появляется (PLAN.md §4).
  return json({ participantId: participant.id, participantToken: token }, 201);
}

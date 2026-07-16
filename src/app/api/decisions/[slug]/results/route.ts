// GET /api/decisions/{slug}/results — текущий расклад по методу Борда (PLAN.md §6).
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { options, participants, rankings } from '@/lib/db/schema';
import { apiError, json } from '@/lib/api';
import { computeResults } from '@/lib/borda';
import { getDecisionBySlug } from '@/lib/decisions';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const decision = await getDecisionBySlug(slug);
  if (!decision) return apiError('Решение не найдено', 404);

  const [opts, parts, rankRows] = await Promise.all([
    db
      .select({ id: options.id, label: options.label })
      .from(options)
      .where(eq(options.decisionId, decision.id))
      .orderBy(asc(options.position)),
    db
      .select({ id: participants.id, name: participants.name })
      .from(participants)
      .where(eq(participants.decisionId, decision.id))
      .orderBy(asc(participants.createdAt)),
    db
      .select({
        participantId: rankings.participantId,
        optionId: rankings.optionId,
        rank: rankings.rank,
      })
      .from(rankings)
      .innerJoin(participants, eq(rankings.participantId, participants.id))
      .where(eq(participants.decisionId, decision.id)),
  ]);

  // Сид тай-брейка = slug (PLAN.md §3): результат детерминирован и не «прыгает» при поллинге.
  const { tally, winnerId } = computeResults(opts, rankRows, decision.slug);

  const votedIds = new Set(rankRows.map((r) => r.participantId));
  const votedNames = parts.filter((p) => votedIds.has(p.id)).map((p) => p.name);

  return json({
    status: decision.status,
    tally,
    winnerId,
    participantsCount: parts.length,
    votedNames,
  });
}

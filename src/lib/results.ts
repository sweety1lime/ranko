// Расклад по методу Борда для одного решения. Живёт отдельно от route handler по той же причине,
// что и getDecisionView (src/lib/decisions.ts): ровно эту форму отдаёт GET /api/decisions/{slug}/results
// и на ней же рендерится страница результатов, так что разойтись им негде.
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { options, participants, rankings, type Decision } from '@/lib/db/schema';
import { computeResults, type TallyEntry } from '@/lib/borda';
import { getDecisionBySlug } from '@/lib/decisions';

// Место едет рядом с очками, чтобы у победителя была ссылка «На карте»: результат — это ответ
// на вопрос «куда идём», и без адреса он половинчатый.
export type TallyRow = TallyEntry & { place: string | null };

export type ResultsResponse = {
  status: Decision['status'];
  city: string | null;
  tally: TallyRow[];
  winnerId: string | null;
  participantsCount: number;
  votedNames: string[];
};

// Собирает расклад или null, если slug неизвестен. Статус приходит из getDecisionBySlug уже
// актуальным (ленивое закрытие по дедлайну, PLAN.md §5).
export async function getResults(slug: string): Promise<ResultsResponse | null> {
  const decision = await getDecisionBySlug(slug);
  if (!decision) return null;

  const [opts, parts, rankRows] = await Promise.all([
    db
      .select({ id: options.id, label: options.label, place: options.place })
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

  // Место домешиваем после подсчёта, а не протаскиваем через computeResults: очки от адреса
  // не зависят, и borda.ts остаётся чистым счётчиком.
  const placeById = new Map(opts.map((o) => [o.id, o.place]));
  const rows: TallyRow[] = tally.map((entry) => ({
    ...entry,
    place: placeById.get(entry.optionId) ?? null,
  }));

  const votedIds = new Set(rankRows.map((r) => r.participantId));
  const votedNames = parts.filter((p) => votedIds.has(p.id)).map((p) => p.name);

  return {
    status: decision.status,
    city: decision.city,
    tally: rows,
    winnerId,
    participantsCount: parts.length,
    votedNames,
  };
}

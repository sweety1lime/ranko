// Узнавание участника по токену — для server-компонента страницы голосования (PLAN.md §4).
// Токен приезжает из httpOnly-cookie, прочитать которую клиент не может по определению, поэтому
// разрешает личность сервер: кто это и какой порядок он уже отправил.
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { decisions, participants, rankings } from '@/lib/db/schema';

export type ParticipantState = {
  name: string;
  // optionId[] в порядке предпочтений (rank 0 — самый желанный); пусто, если ещё не голосовал.
  order: string[];
};

// Ищем участника сразу по slug решения, чтобы не тащить в вызывающий код id решения: сам id
// в публичном представлении (DecisionView) не нужен и наружу не отдаётся.
// Токен не найден → null: участника удалили админом или cookie протухла — обе ветки одинаковы,
// UI просто попросит имя заново.
export async function getParticipantState(slug: string, token: string): Promise<ParticipantState | null> {
  const [participant] = await db
    .select({ id: participants.id, name: participants.name })
    .from(participants)
    .innerJoin(decisions, eq(participants.decisionId, decisions.id))
    .where(and(eq(decisions.slug, slug), eq(participants.token, token)))
    .limit(1);
  if (!participant) return null;

  const rows = await db
    .select({ optionId: rankings.optionId })
    .from(rankings)
    .where(eq(rankings.participantId, participant.id))
    .orderBy(asc(rankings.rank));

  return { name: participant.name, order: rows.map((row) => row.optionId) };
}

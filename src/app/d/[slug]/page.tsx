// Страница голосования /d/{slug} (PLAN.md §7). Рендерим на сервере: основной сценарий —
// открыли ссылку из мессенджера на телефоне, и вопрос должен быть виден сразу, без спиннера.
// Читаем тем же getDecisionView, что и GET-ручка, — токены в него не попадают по построению.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getDecisionView } from '@/lib/decisions';
import { participantCookieName } from '@/lib/participant-cookie';
import { getParticipantState } from '@/lib/participants';
import { VoteScreen } from './vote-screen';

// Заголовок вкладки и текст в мессенджере — сам вопрос (PLAN.md §2 п.6). Саму картинку рисует
// соседний opengraph-image.tsx; здесь её не упоминаем — Next подставит её в openGraph сам.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decision = await getDecisionView(slug);
  if (!decision) return { title: 'Решение не найдено' };

  const description = decision.description ?? 'Расставьте варианты по вкусу — алгоритм найдёт компромисс.';
  return {
    title: decision.title,
    description,
    openGraph: { title: decision.title, description, type: 'website' },
  };
}

export default async function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decision = await getDecisionView(slug);
  if (!decision) notFound();

  // Голосовать больше не в чем — показываем итоги (PLAN.md §2, п.5). Статус здесь уже актуальный:
  // getDecisionView лениво закрывает решение по дедлайну, так что редирект ловит и этот случай.
  if (decision.status === 'closed') redirect(`/d/${slug}/results`);

  // httpOnly-cookie дублем к localStorage (PLAN.md §4): читаем её здесь, потому что клиенту она
  // недоступна. Узнали участника — сразу отдаём его имя и уже отправленный порядок, так что
  // вернувшийся видит свой расклад, даже если localStorage вычистили.
  const token = (await cookies()).get(participantCookieName(slug))?.value;
  const participant = token ? await getParticipantState(slug, token) : null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col p-6 py-10">
      <VoteScreen decision={decision} knownParticipant={participant} />
    </main>
  );
}

// Страница голосования /d/{slug} (PLAN.md §7). Рендерим на сервере: основной сценарий —
// открыли ссылку из мессенджера на телефоне, и вопрос должен быть виден сразу, без спиннера.
// Читаем тем же getDecisionView, что и GET-ручка, — токены в него не попадают по построению.
import { notFound } from 'next/navigation';
import { getDecisionView } from '@/lib/decisions';
import { VoteScreen } from './vote-screen';

export default async function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decision = await getDecisionView(slug);
  if (!decision) notFound();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col p-6 py-10">
      <VoteScreen decision={decision} />
    </main>
  );
}

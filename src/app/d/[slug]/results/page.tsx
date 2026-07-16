// Страница результатов /d/{slug}/results (PLAN.md §7). Как и страница голосования, рендерит вопрос
// на сервере: ссылку открывают из мессенджера, и заголовок должен быть виден сразу.
// Расклад тоже считаем на сервере и отдаём в ResultsView как fallbackData — первый экран приходит
// с цифрами, а дальше его обновляет поллинг.
import { notFound } from 'next/navigation';
import { getDecisionView } from '@/lib/decisions';
import { getResults } from '@/lib/results';
import { Button } from '@/components/ui/button';
import { ResultsView } from './results-view';

export default async function ResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [decision, results] = await Promise.all([getDecisionView(slug), getResults(slug)]);
  if (!decision || !results) notFound();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 p-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{decision.title}</h1>
        {decision.description && (
          <p className="text-muted-foreground text-sm text-balance">{decision.description}</p>
        )}
        {results.status === 'closed' && (
          <p className="text-muted-foreground text-sm">Голосование закрыто — итоги окончательные.</p>
        )}
      </header>

      <ResultsView slug={slug} fallbackData={results} />

      {results.status === 'open' && (
        <Button variant="outline" render={<a href={`/d/${slug}`} />} nativeButton={false} className="h-11">
          Изменить мой порядок
        </Button>
      )}
    </main>
  );
}

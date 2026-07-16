'use client';

// Живой расклад решения (PLAN.md §7): победитель крупно, «почему», таблица очков и кто уже
// проголосовал. Поллинг раз в 4 секунды — чтобы два окна видели голоса друг друга сами.
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { initials } from '@/lib/initials';
import { plural } from '@/lib/plural';
import type { ResultsResponse } from '@/lib/results';
import type { TallyEntry } from '@/lib/borda';

// Порядок строк таблицы. Победитель всегда первый: очков у него по определению максимум, но при
// равенстве финальный тай-брейк на сервере идёт по сид-хэшу (PLAN.md §3), который отсюда не виден, —
// поэтому не пересчитываем победителя, а доверяем winnerId с ручки.
function compareRows(winnerId: string | null) {
  return (a: TallyEntry, b: TallyEntry) => {
    if (a.optionId === winnerId) return -1;
    if (b.optionId === winnerId) return 1;
    return (
      b.points - a.points || b.firstPlaces - a.firstPlaces || a.lastPlaces - b.lastPlaces
    );
  };
}

// Объяснение победы словами (PLAN.md §3: показать не только победителя, но и «почему»).
function explainWinner(winner: TallyEntry): string {
  const points = `${winner.points} ${plural(winner.points, 'очко', 'очка', 'очков')}`;
  const firsts = `${winner.firstPlaces} ${plural(winner.firstPlaces, 'первое место', 'первых места', 'первых мест')}`;
  return `${points} · ${firsts}`;
}

// fallbackData — расклад, посчитанный сервером при рендере страницы: первый экран приходит уже
// с цифрами, без спиннера, а поллинг подхватывает дальше.
export function ResultsView({ slug, fallbackData }: { slug: string; fallbackData: ResultsResponse }) {
  const { data, error } = useSWR<ResultsResponse>(`/api/decisions/${slug}/results`, fetcher, {
    fallbackData,
    // Закрытое голосование больше не меняется — поллить нечего (PLAN.md §2, п.5).
    refreshInterval: (latest) => (latest?.status === 'closed' ? 0 : 4000),
  });

  const results = data ?? fallbackData;
  const closed = results.status === 'closed';
  const winner = results.tally.find((entry) => entry.optionId === results.winnerId) ?? null;
  const rows = [...results.tally].sort(compareRows(results.winnerId));

  return (
    <div className="flex flex-col gap-8">
      {/* Ошибка поллинга — не повод прятать уже показанный расклад: он просто перестаёт обновляться. */}
      {error && (
        <p role="status" className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
          Не удалось обновить расклад: {(error as Error).message}
        </p>
      )}

      {winner ? (
        <section className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {closed ? 'Победил' : 'Сейчас впереди'}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">{winner.label}</h2>
          <p className="text-muted-foreground text-sm">{explainWinner(winner)}</p>
        </section>
      ) : (
        <section className="border-border rounded-lg border border-dashed p-4">
          <p className="font-medium">Голосов пока нет</p>
          <p className="text-muted-foreground mt-1 text-sm text-balance">
            Расклад появится, как только кто-нибудь расставит варианты.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Расклад по очкам</h3>
        {/* Узкий экран — основной сценарий: даём таблице прокрутиться, а не ломать вёрстку страницы. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Очки вариантов по методу Борда: сумма очков, число первых и последних мест
            </caption>
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th scope="col" className="pb-2 text-left font-medium">
                  Вариант
                </th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium">
                  Очки
                </th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium">
                  Первых
                </th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium">
                  Последних
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.optionId} className="border-border border-t">
                  <th
                    scope="row"
                    className={`py-2.5 text-left font-normal ${row.optionId === results.winnerId ? 'font-medium' : ''}`}
                  >
                    {row.label}
                  </th>
                  <td className="py-2.5 pl-3 text-right font-medium tabular-nums">{row.points}</td>
                  <td className="text-muted-foreground py-2.5 pl-3 text-right tabular-nums">
                    {row.firstPlaces}
                  </td>
                  <td className="text-muted-foreground py-2.5 pl-3 text-right tabular-nums">
                    {row.lastPlaces}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">
          Проголосовали {results.votedNames.length} из {results.participantsCount}
        </h3>
        {results.votedNames.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {/* Имена не уникальны (регистрации нет) — ключ по индексу, список только для показа. */}
            {results.votedNames.map((name, index) => (
              <li
                key={index}
                title={name}
                className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full text-xs font-medium"
              >
                <span aria-hidden>{initials(name)}</span>
                <span className="sr-only">{name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Пока никто не отправил свой порядок.</p>
        )}
      </section>
    </div>
  );
}

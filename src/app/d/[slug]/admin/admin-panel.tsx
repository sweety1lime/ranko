'use client';

// Панель админа (PLAN.md §2, п.5): те же результаты + закрыть голосование, удалить участника,
// удалить решение. adminToken живёт здесь и уходит в тело запросов — это by design (PLAN.md §4:
// право админа = знание токена, он и так у админа в адресной строке).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Trash2 } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import type { DecisionView } from '@/lib/decisions';
import type { ResultsResponse } from '@/lib/results';
import { Button } from '@/components/ui/button';
import { ResultsView } from '../results/results-view';

// Из решения админке нужны только статус и участники с id. Берём узкий срез намеренно: в полном
// DecisionView есть поля-даты, которые переживают рендер сервера, но приезжают строками из JSON, —
// на этой паре типы честны для обоих путей.
type AdminDecisionState = Pick<DecisionView, 'status' | 'participants'>;

// Что подтверждаем прямо сейчас: 'close', 'delete' или 'p:{id}' для конкретного участника.
// Диалог ради двух кнопок был бы лишней зависимостью — подтверждаем на месте, второй кнопкой.
type Confirming = string | null;

export function AdminPanel({
  slug,
  adminToken,
  fallbackDecision,
  fallbackResults,
}: {
  slug: string;
  adminToken: string;
  fallbackDecision: AdminDecisionState;
  fallbackResults: ResultsResponse;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Список участников — из публичного представления решения: ручка результатов отдаёт только имена
  // (PLAN.md §6), а для удаления нужен id. Тот же интервал 4 с, что и у результатов.
  const { data: decision, mutate: mutateDecision } = useSWR<AdminDecisionState>(
    `/api/decisions/${slug}`,
    fetcher,
    {
      fallbackData: fallbackDecision,
      refreshInterval: (latest) => (latest?.status === 'closed' ? 0 : 4000),
    },
  );
  const { mutate: mutateResults } = useSWR<ResultsResponse>(
    `/api/decisions/${slug}/results`,
    fetcher,
    { fallbackData: fallbackResults },
  );

  const state = decision ?? fallbackDecision;
  const closed = state.status === 'closed';

  // Все админские ручки устроены одинаково: adminToken в теле, ошибка — { error } (PLAN.md §6).
  async function request(url: string, method: 'POST' | 'DELETE'): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? 'Не удалось выполнить действие');
        return false;
      }
      return true;
    } catch {
      setError('Сеть недоступна. Проверьте соединение и попробуйте ещё раз.');
      return false;
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function handleClose() {
    if (await request(`/api/decisions/${slug}/close`, 'POST')) {
      await Promise.all([mutateDecision(), mutateResults()]);
    }
  }

  async function handleDeleteDecision() {
    if (await request(`/api/decisions/${slug}`, 'DELETE')) {
      // Решения больше нет — возвращаться на эту страницу некуда, поэтому replace, а не push.
      router.replace('/');
    }
  }

  async function handleDeleteParticipant(id: string) {
    if (await request(`/api/decisions/${slug}/participants/${id}`, 'DELETE')) {
      // Вместе с участником уходят и его ранжировки — расклад пересчитываем тоже.
      await Promise.all([mutateDecision(), mutateResults()]);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <ResultsView slug={slug} fallbackData={fallbackResults} />

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Участники ({state.participants.length})</h3>
        {state.participants.length > 0 ? (
          <ul className="flex flex-col">
            {state.participants.map((participant) => (
              <li
                key={participant.id}
                className="border-border flex items-center justify-between gap-3 border-t py-2"
              >
                <span className="truncate text-sm">{participant.name}</span>
                {confirming === `p:${participant.id}` ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleDeleteParticipant(participant.id)}
                    >
                      Удалить
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Отмена
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="shrink-0"
                    aria-label={`Удалить участника: ${participant.name}`}
                    onClick={() => setConfirming(`p:${participant.id}`)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Пока никто не присоединился.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Действия</h3>

        {closed ? (
          <p className="text-muted-foreground text-sm">
            Голосование закрыто — участники видят только результаты.
          </p>
        ) : confirming === 'close' ? (
          <ConfirmRow
            question="Закрыть голосование? Изменить голоса будет уже нельзя."
            action="Закрыть"
            busy={busy}
            onConfirm={handleClose}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <Button variant="outline" className="h-11" onClick={() => setConfirming('close')}>
            Закрыть голосование
          </Button>
        )}

        {confirming === 'delete' ? (
          <ConfirmRow
            question="Удалить решение? Пропадут все варианты и голоса, ссылка перестанет открываться."
            action="Удалить"
            busy={busy}
            onConfirm={handleDeleteDecision}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <Button variant="destructive" className="h-11" onClick={() => setConfirming('delete')}>
            Удалить решение
          </Button>
        )}
      </section>
    </div>
  );
}

function ConfirmRow({
  question,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <p className="text-sm text-balance">{question}</p>
      <div className="flex gap-2">
        <Button variant="destructive" className="h-10 flex-1" disabled={busy} onClick={onConfirm}>
          {busy ? 'Секунду…' : action}
        </Button>
        <Button variant="outline" className="h-10 flex-1" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

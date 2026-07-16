'use client';

// Экран голосования (PLAN.md §7): имя → ранжирование → отправка. Вернувшегося участника узнаём
// по participantToken из localStorage и даём изменить порядок, пока голосование открыто.
import { useState } from 'react';
import type { DecisionView } from '@/lib/decisions';
import {
  clearParticipant,
  loadParticipant,
  saveParticipant,
  type StoredParticipant,
} from '@/lib/participant-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RankList, type RankItem } from './rank-list';

type Stage = 'name' | 'rank' | 'done';

// Порядок вариантов для участника: сохранённый с прошлой отправки, иначе — как их завёл создатель.
// Сохранённый чиним под текущий набор вариантов: заморозка вариантов — это Фаза 5, а до неё
// набор мог измениться, и «протухший» порядок не должен ни терять, ни задваивать карточки.
function initialItems(decision: DecisionView, savedOrder: string[]): RankItem[] {
  const byId = new Map(decision.options.map((option) => [option.id, option]));
  const restored = savedOrder.map((id) => byId.get(id)).filter((option) => option !== undefined);
  const restoredIds = new Set(restored.map((option) => option.id));
  const rest = decision.options.filter((option) => !restoredIds.has(option.id));

  return [...restored, ...rest].map(({ id, label }) => ({ id, label }));
}

export function VoteScreen({ decision }: { decision: DecisionView }) {
  // Читаем localStorage лениво в инициализаторе: на сервере его нет, а useEffect дал бы моргание
  // экрана имени вернувшемуся участнику.
  const [participant, setParticipant] = useState<StoredParticipant | null>(() =>
    loadParticipant(decision.slug),
  );
  const [name, setName] = useState(participant?.name ?? '');
  const [items, setItems] = useState<RankItem[]>(() =>
    initialItems(decision, participant?.order ?? []),
  );
  const [stage, setStage] = useState<Stage>(() => (participant ? 'rank' : 'name'));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resultsHref = `/d/${decision.slug}/results`;

  if (decision.status === 'closed') {
    return (
      <EmptyState title="Голосование закрыто">
        <p className="text-muted-foreground text-sm text-balance">
          Организатор подвёл итоги — свой порядок изменить уже нельзя.
        </p>
        <Button render={<a href={resultsHref} />} className="mt-2 h-12 text-base">
          Посмотреть результаты
        </Button>
      </EmptyState>
    );
  }

  // Токен не признан сервером: участника удалил админ. Забываем запись и просим имя заново,
  // вместо тупика с необъяснимой ошибкой.
  function forgetParticipant() {
    clearParticipant(decision.slug);
    setParticipant(null);
    setName('');
    setStage('name');
    setNotice('Организатор удалил вас из голосования. Можно присоединиться заново.');
  }

  function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!name.trim()) {
      setError('Введите имя');
      return;
    }
    setStage('rank');
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    try {
      // Участника создаём один раз — при первой отправке. Если шаг упадёт ниже, на PUT,
      // токен уже сохранён и повтор отправки починит (как в vote/route.ts).
      let current = participant;
      if (!current) {
        const response = await fetch(`/api/decisions/${decision.slug}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? 'Не удалось присоединиться');
          return;
        }

        current = { token: data.participantToken, name: name.trim(), order: [] };
        setParticipant(current);
        saveParticipant(decision.slug, current);
      }

      const order = items.map((item) => item.id);
      const response = await fetch(`/api/decisions/${decision.slug}/vote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantToken: current.token, order }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 403 && participant) {
          forgetParticipant();
          return;
        }
        setError(data.error ?? 'Не удалось отправить голос');
        return;
      }

      saveParticipant(decision.slug, { ...current, order });
      setStage('done');
    } catch {
      setError('Сеть недоступна. Проверьте соединение и попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{decision.title}</h1>
        {decision.description && (
          <p className="text-muted-foreground text-sm text-balance">{decision.description}</p>
        )}
      </header>

      {notice && (
        <p role="status" className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
          {notice}
        </p>
      )}

      {stage === 'name' && (
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Как вас зовут?</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя"
              maxLength={40}
              required
              autoFocus
              className="h-11"
            />
            <p className="text-muted-foreground text-xs">
              Имя увидят остальные участники — чтобы понимать, кто уже проголосовал.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button type="submit" className="h-12 text-base">
            Участвовать
          </Button>
        </form>
      )}

      {stage === 'rank' && (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm text-balance">
            Расставьте варианты по вкусу: сверху — самый желанный. Тащите за
            <span className="mx-1 align-middle">⠿</span>
            или двигайте стрелками.
          </p>

          <RankList items={items} onChange={setItems} />

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button onClick={handleSubmit} disabled={submitting} className="h-12 text-base">
            {submitting ? 'Отправляем…' : 'Отправить'}
          </Button>
        </div>
      )}

      {stage === 'done' && (
        <div className="flex flex-col gap-4">
          <div className="border-border rounded-lg border border-dashed p-4">
            <p className="font-medium">Голос учтён</p>
            <p className="text-muted-foreground mt-1 text-sm text-balance">
              Порядок можно менять, пока голосование открыто — просто вернитесь по этой ссылке.
            </p>
          </div>

          <Button render={<a href={resultsHref} />} className="h-12 text-base">
            К результатам
          </Button>
          <Button variant="outline" onClick={() => setStage('rank')} className="h-11">
            Изменить мой порядок
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {children}
    </div>
  );
}

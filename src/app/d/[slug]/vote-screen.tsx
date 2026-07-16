'use client';

// Экран голосования (PLAN.md §7): имя → ранжирование → отправка. Вернувшегося участника узнаём
// по participantToken из localStorage и даём изменить порядок, пока голосование открыто.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DecisionView } from '@/lib/decisions';
import type { ParticipantState } from '@/lib/participants';
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

// Закрыто ли голосование прямо сейчас. Нужна, чтобы развести две причины 403 на отправке голоса:
// «закрыли, пока вы двигали карточки» и «админ удалил участника». Спрашиваем статус у сервера,
// а не разбираем текст ошибки: текст — это сообщение человеку, а не контракт (PLAN.md §6).
async function isVotingClosed(slug: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/decisions/${slug}`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === 'closed';
  } catch {
    return false;
  }
}

// knownParticipant — участник, узнанный сервером по httpOnly-cookie (PLAN.md §4). Это второй,
// независимый от localStorage источник личности: он работает, даже когда localStorage пуст.
export function VoteScreen({
  decision,
  knownParticipant,
}: {
  decision: DecisionView;
  knownParticipant: ParticipantState | null;
}) {
  const router = useRouter();
  // Читаем localStorage лениво в инициализаторе: на сервере его нет, а useEffect дал бы моргание
  // экрана имени вернувшемуся участнику.
  const [participant, setParticipant] = useState<StoredParticipant | null>(() =>
    loadParticipant(decision.slug),
  );
  // Узнал ли нас сервер по cookie. Сбрасываем, если сервер перестал признавать личность (403).
  const [knownByCookie, setKnownByCookie] = useState(knownParticipant !== null);
  const [name, setName] = useState(participant?.name ?? knownParticipant?.name ?? '');
  const [items, setItems] = useState<RankItem[]>(() =>
    // Порядок с сервера авторитетнее localStorage: он и есть то, что реально записано в БД.
    initialItems(decision, knownParticipant?.order ?? participant?.order ?? []),
  );
  const [stage, setStage] = useState<Stage>(() =>
    participant || knownParticipant ? 'rank' : 'name',
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resultsHref = `/d/${decision.slug}/results`;

  // Закрытое голосование сюда не доходит: страница редиректит на результаты ещё на сервере
  // (PLAN.md §2, п.5). Закрытие прямо во время ранжирования ловим ниже, на ответе 403.

  // Токен не признан сервером: участника удалил админ. Забываем запись и просим имя заново,
  // вместо тупика с необъяснимой ошибкой. Cookie отсюда не стереть (она httpOnly), но и не надо:
  // сервер её уже не признаёт, а при следующей загрузке страницы просто не узнает участника.
  function forgetParticipant() {
    clearParticipant(decision.slug);
    setParticipant(null);
    setKnownByCookie(false);
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
      // Участника создаём один раз — при первой отправке. Если нас уже знают (localStorage или
      // cookie), присоединяться повторно нельзя: получим второго «призрака» с тем же именем.
      // Если шаг упадёт ниже, на PUT, токен уже сохранён и повтор отправки починит (как в vote/route.ts).
      let current = participant;
      if (!current && !knownByCookie) {
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
        setKnownByCookie(true); // тем же ответом пришла и cookie
        saveParticipant(decision.slug, current);
      }

      const order = items.map((item) => item.id);
      const response = await fetch(`/api/decisions/${decision.slug}/vote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Токена может не быть вовсе: localStorage вычистили, а cookie прочитать нельзя (httpOnly).
        // Тогда личность возьмётся из неё же на сервере — cookie уедет с запросом сама.
        body: JSON.stringify(current ? { participantToken: current.token, order } : { order }),
      });

      if (!response.ok) {
        const data = await response.json();

        if (response.status === 403) {
          // Голосование закрыли, пока мы двигали карточки, — менять уже нечего, отправляем к итогам.
          if (await isVotingClosed(decision.slug)) {
            router.replace(resultsHref);
            return;
          }
          // Иначе 403 значит, что сервер не признал личность: участника удалил админ.
          if (participant || knownByCookie) {
            forgetParticipant();
            return;
          }
        }

        setError(data.error ?? 'Не удалось отправить голос');
        return;
      }

      if (current) saveParticipant(decision.slug, { ...current, order });
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

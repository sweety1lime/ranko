'use client';

// Форма создания решения и экран «две ссылки» (PLAN.md §2, §7). Отправляем в POST /api/decisions —
// валидация живёт там (zod, createDecisionSchema), здесь дублируем лишь минимум для мгновенной
// обратной связи, а источник истины по ошибке — { error } из ответа.
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CopyLink } from './copy-link';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;

type Created = { slug: string; adminToken: string };

export function CreateForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  if (created) return <CreatedLinks created={created} />;

  function setOptionAt(index: number, value: string) {
    setOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
  }

  function removeOptionAt(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const filled = options.map((option) => option.trim()).filter(Boolean);
    if (filled.length < MIN_OPTIONS) {
      setError('Нужно минимум 2 варианта');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          options: filled,
          // datetime-local даёт локальное время без зоны, а схема ждёт ISO со смещением.
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Не удалось создать решение');
        return;
      }
      setCreated(data);
    } catch {
      setError('Сеть недоступна. Проверьте соединение и попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Вопрос</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Куда идём в пятницу?"
          maxLength={120}
          required
          autoFocus
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Описание (необязательно)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Пара слов о контексте"
          maxLength={500}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">Варианты</legend>
        <div className="flex flex-col gap-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={option}
                onChange={(e) => setOptionAt(index, e.target.value)}
                placeholder={`Вариант ${index + 1}`}
                maxLength={80}
                aria-label={`Вариант ${index + 1}`}
                className="h-11"
              />
              {options.length > MIN_OPTIONS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOptionAt(index)}
                  aria-label={`Удалить вариант ${index + 1}`}
                  className="size-11 shrink-0"
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
        </div>

        {options.length < MAX_OPTIONS && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOptions((prev) => [...prev, ''])}
            className="h-11 self-start"
          >
            <Plus />
            Вариант
          </Button>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deadline">Дедлайн (необязательно)</Label>
        <Input
          id="deadline"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="h-11"
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="h-12 text-base">
        {submitting ? 'Создаём…' : 'Создать решение'}
      </Button>
    </form>
  );
}

// Экран «две ссылки»: публичная — в чат, админская — себе. Живёт состоянием на лендинге,
// отдельного маршрута для него в §7 нет.
function CreatedLinks({ created }: { created: Created }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const publicUrl = `${origin}/d/${created.slug}`;
  const adminUrl = `${origin}/d/${created.slug}/admin?token=${created.adminToken}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Решение готово</h2>
        <p className="text-muted-foreground text-sm text-balance">
          Киньте первую ссылку в чат — по ней участники ранжируют варианты.
        </p>
      </div>

      <CopyLink label="Ссылка для участников" url={publicUrl} />
      <CopyLink label="Ссылка для админа" url={adminUrl} />

      <p className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
        Сохраните админ-ссылку: она открывает управление голосованием и показывается только сейчас —
        после обновления страницы её будет не восстановить.
      </p>

      <Button render={<a href={publicUrl} />} nativeButton={false} className="h-12 text-base">
        Перейти к голосованию
      </Button>
    </div>
  );
}

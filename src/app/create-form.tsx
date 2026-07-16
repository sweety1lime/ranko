'use client';

// Форма создания решения и экран «две ссылки» (PLAN.md §2, §7). Отправляем в POST /api/decisions —
// валидация живёт там (zod, createDecisionSchema), здесь дублируем лишь минимум для мгновенной
// обратной связи, а источник истины по ошибке — { error } из ответа.
import { useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CopyLink } from './copy-link';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;

type Created = { slug: string; adminToken: string };
// placeOpen — раскрыто ли поле места. Живёт в родителе, а не в OptionField: только так форма
// знает, какое поле раскрыто первым, и показывает подсказку один раз, а не под каждым.
type OptionDraft = { label: string; place: string; placeOpen: boolean };

const emptyOption = (): OptionDraft => ({ label: '', place: '', placeOpen: false });

export function CreateForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([emptyOption(), emptyOption()]);
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  if (created) return <CreatedLinks created={created} />;

  function updateOptionAt(index: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  }

  function removeOptionAt(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const filled = options
      .map((option) => ({ label: option.label.trim(), place: option.place.trim() }))
      .filter((option) => option.label);
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
          city: city.trim() || undefined,
          options: filled.map(({ label, place }) => ({ label, place: place || undefined })),
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="city">Город (необязательно)</Label>
        <Input
          id="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Москва"
          maxLength={80}
          className="h-11"
        />
        <p className="text-muted-foreground text-xs">
          Нужен, только если место варианта задано адресом: по нему уточним поиск на карте.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">Варианты</legend>
        <div className="flex flex-col gap-4">
          {options.map((option, index) => (
            <OptionField
              key={index}
              option={option}
              index={index}
              removable={options.length > MIN_OPTIONS}
              // Как заполнять место, объясняем один раз — у первого раскрытого поля.
              showHint={index === options.findIndex((o) => o.placeOpen)}
              onChange={(patch) => updateOptionAt(index, patch)}
              onRemove={() => removeOptionAt(index)}
            />
          ))}
        </div>

        {options.length < MAX_OPTIONS && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOptions((prev) => [...prev, emptyOption()])}
            className="mt-2 h-11 self-start"
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

// Вариант с опциональным местом (PLAN.md §8, Фаза 7). Поле места прячем за «+ место»: указывают
// его редко и не для всех вариантов, а двадцать всегда открытых пар инпутов на телефоне
// превращают форму в простыню.
function OptionField({
  option,
  index,
  removable,
  showHint,
  onChange,
  onRemove,
}: {
  option: OptionDraft;
  index: number;
  removable: boolean;
  showHint: boolean;
  onChange: (patch: Partial<OptionDraft>) => void;
  onRemove: () => void;
}) {
  const placeId = `option-place-${index}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={option.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={`Вариант ${index + 1}`}
          maxLength={80}
          aria-label={`Вариант ${index + 1}`}
          className="h-11"
        />
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`Удалить вариант ${index + 1}`}
            className="size-11 shrink-0"
          >
            <X />
          </Button>
        )}
      </div>

      {option.placeOpen ? (
        <div className="flex flex-col gap-1.5 pl-3">
          <Label htmlFor={placeId} className="text-muted-foreground text-xs">
            Место для варианта {index + 1}
          </Label>
          <Input
            id={placeId}
            value={option.place}
            onChange={(e) => onChange({ place: e.target.value })}
            placeholder="Ссылка из «Поделиться» или адрес"
            maxLength={200}
            className="h-11"
          />
          {showHint && (
            <p className="text-muted-foreground text-xs">
              Откройте место в Яндекс.Картах, нажмите «Поделиться» и вставьте ссылку — участник
              попадёт точно на точку. Можно просто адресом.
            </p>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange({ placeOpen: true })}
          // Номер варианта — в имени кнопки: на экране их до двадцати, и без него «место»
          // не различить ни скринридеру, ни тесту.
          aria-label={`Добавить место для варианта ${index + 1}`}
          className="text-muted-foreground h-9 self-start px-3 text-xs"
        >
          <MapPin className="size-3" />
          место
        </Button>
      )}
    </div>
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

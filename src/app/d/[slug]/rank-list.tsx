'use client';

// Ранжирование вариантов: сверху — самый желанный (PLAN.md §2). Две равноправные точки входа
// в одну и ту же перестановку — драг и стрелки ↑/↓ (PLAN.md §4).
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, ExternalLink, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

// mapHref и placeText считает вызывающий (vote-screen через src/lib/place.ts): здесь только
// рендер, чтобы список не знал ни про город решения, ни про правила доверия ссылкам.
export type RankItem = { id: string; label: string; mapHref: string | null; placeText: string | null };

export function RankList({
  items,
  onChange,
}: {
  items: RankItem[];
  onChange: (next: RankItem[]) => void;
}) {
  const sensors = useSensors(
    // Мышь/перо: небольшой порог, чтобы клик по стрелке не превращался в драг.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Тач: короткое удержание — иначе тап по стрелке внутри карточки конкурирует с драгом.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from === -1 || to === -1) return;

    onChange(arrayMove(items, from, to));
  }

  // Та же перестановка, что и драг: стрелки — не «режим для слабых», а вторая дверь в неё.
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    onChange(arrayMove(items, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onMoveUp={() => move(index, index - 1)}
              onMoveDown={() => move(index, index + 1)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  index,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  item: RankItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border-border bg-background flex items-center gap-1 rounded-lg border p-1 ${
        isDragging ? 'z-10 shadow-lg' : ''
      }`}
    >
      {/* Драг только за грип: на телефоне драг за всю карточку конфликтует со скроллом списка. */}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg outline-none focus-visible:ring-3 active:cursor-grabbing"
        aria-label={`Перетащить «${item.label}»`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="text-muted-foreground w-5 shrink-0 text-center text-sm tabular-nums">
        {index + 1}
      </span>

      <div className="flex flex-1 flex-col gap-0.5 py-2">
        <span className="text-sm break-words">{item.label}</span>
        {item.mapHref && item.placeText && (
          // Драгу не мешает: тащат только за грип, а TouchSensor держит задержку 200 мс,
          // так что тап по ссылке не превращается в перетаскивание.
          <a
            href={item.mapHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.placeText} — открыть на карте`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex w-fit items-center gap-1 rounded-sm text-xs underline underline-offset-2 outline-none focus-visible:ring-3"
          >
            <span className="break-all">{item.placeText}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Переместить «${item.label}» вверх`}
          className="size-11"
        >
          <ChevronUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Переместить «${item.label}» вниз`}
          className="size-11"
        >
          <ChevronDown />
        </Button>
      </div>
    </li>
  );
}

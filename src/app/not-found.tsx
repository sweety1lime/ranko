// Общая 404 (PLAN.md §8, Фаза 5). Сюда приземляются все notFound() приложения: неизвестный slug,
// удалённое решение, админ-ссылка с чужим токеном. Формулировка нарочно покрывает все три случая
// разом — какой именно, посетителю знать неоткуда, а гадать вслух хуже, чем сказать честно.
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Страница не найдена
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Здесь ничего нет
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          Возможно, решение удалили, или в ссылке потерялся символ. Проверьте ссылку из чата —
          она должна выглядеть так: <span className="font-mono text-xs">/d/xxxxxxxxxx</span>
        </p>
      </header>

      {/* nativeButton={false} обязателен, когда кнопка рендерится ссылкой: иначе Base UI ждёт
          нативный <button> и предупреждает о потерянной семантике. */}
      <Button render={<Link href="/" />} nativeButton={false} className="h-12 text-base">
        Создать своё решение
      </Button>
    </main>
  );
}

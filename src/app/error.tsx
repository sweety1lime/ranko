'use client';

// Граница ошибок (PLAN.md §8, Фаза 5): что угодно упало при рендере — человек видит объяснение
// и кнопку, а не белый экран. Текст ошибки не показываем: в нём бывают внутренности, а посетителю
// он всё равно ничего не скажет. Пути наружу два — повторить рендер (reset) и уйти на главную.
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Логируем в консоль сервера/браузера. digest — то, по чему эту ошибку можно найти в логах
    // Vercel. Токенов в error не бывает: их не логируем нигде (PLAN.md §4).
    console.error('Ошибка рендера:', error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Ошибка</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Что-то сломалось</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Мы не смогли показать эту страницу. Попробуйте ещё раз — обычно помогает.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Button onClick={reset} className="h-12 text-base">
          Попробовать снова
        </Button>
        <Button variant="outline" render={<Link href="/" />} nativeButton={false} className="h-11">
          На главную
        </Button>
      </div>
    </main>
  );
}

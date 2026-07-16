// Футер: подпись и канал обратной связи (PLAN.md §8, Фаза 6). Фидбек — обычный mailto, а не форма:
// на запуске важнее, чтобы отзыв дошёл вообще, чем чтобы он лёг в таблицу, а mailto не тянет ни
// зависимости, ни стороннего сборщика ответов.
const SUBJECT = 'Ranko: отзыв';

export function SiteFooter() {
  const email = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL;

  return (
    <footer className="text-muted-foreground mx-auto mt-auto flex w-full max-w-lg items-center justify-between gap-4 p-6 text-xs">
      <span>Ranko — групповые решения без споров</span>
      {/* Адреса нет — нет и ссылки: пустой mailto: открыл бы письмо в никуда. */}
      {email && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(SUBJECT)}`}
          className="hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Написать автору
        </a>
      )}
    </footer>
  );
}

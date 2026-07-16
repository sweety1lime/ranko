// Админ-страница /d/{slug}/admin?token=… (PLAN.md §7): те же результаты плюс управление.
// Аутентификации нет — право админа это знание adminToken (PLAN.md §4), поэтому токен из строки
// запроса сверяем здесь, на сервере, и только потом отдаём панель.
import { notFound } from 'next/navigation';
import { tokensEqual } from '@/lib/api';
import { getDecisionBySlug, getDecisionView } from '@/lib/decisions';
import { getResults } from '@/lib/results';
import { AdminPanel } from './admin-panel';

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  const decision = await getDecisionBySlug(slug);
  if (!decision) notFound();

  // Токена нет или он чужой — страницы для этого посетителя просто не существует. Отдельного
  // «403» намеренно не даём: он подтвердил бы, что решение есть, тому, у кого токена нет.
  // typeof-проверка ещё и защищает tokensEqual от undefined и от ?token=a&token=b.
  if (typeof token !== 'string' || !tokensEqual(token, decision.adminToken)) notFound();

  const [view, results] = await Promise.all([getDecisionView(slug), getResults(slug)]);
  if (!view || !results) notFound();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 p-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Управление решением
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{view.title}</h1>
      </header>

      <AdminPanel
        slug={slug}
        adminToken={token}
        fallbackDecision={{ status: view.status, participants: view.participants }}
        fallbackResults={results}
      />
    </main>
  );
}

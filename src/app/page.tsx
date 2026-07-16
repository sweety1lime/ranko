import { CreateForm } from './create-form';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 p-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ranko</h1>
        <p className="text-muted-foreground text-balance">
          Один вопрос, ссылка друзьям — каждый расставляет варианты по вкусу,
          а алгоритм находит компромисс. Регистрация не нужна.
        </p>
      </header>

      <CreateForm />
    </main>
  );
}

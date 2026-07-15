# Ranko

Источник правды по продукту и фазам — PLAN.md. Не выходить за рамки текущей фазы.

## Команды
- dev-сервер: npm run dev
- проверка: npm run lint && npm run typecheck && npm run test
- e2e: npm run test:e2e
- миграции: npx drizzle-kit generate && npx drizzle-kit migrate

## Конвенции
- TypeScript strict; серверная логика — только route handlers / server actions
- Вся валидация входных данных — zod на границе API
- Схема БД меняется только миграциями drizzle-kit
- UI: Tailwind + shadcn/ui, mobile-first
- Маленькие компоненты, без преждевременных абстракций и лишних зависимостей

## Правила
- Секреты не коммитить; окружение — .env.local (в .gitignore), шаблон — .env.example
- adminToken и participantToken не логировать и не отдавать в GET-ответах
- Перед завершением любой задачи прогнать: lint, typecheck, test — всё зелёное
- Алгоритм в src/lib/borda.ts и схему БД не менять без явного запроса

## Коммиты
- Автор — только владелец репозитория (sweety1lime <sweety.lime@bk.ru>); коммитить строго от его имени
- Никаких упоминаний ИИ/агентов: без «Co-Authored-By: Claude», без «Generated with Claude Code», без роботов-эмодзи и подобного
- Сообщения очеловеченные — живой, естественный тон разработчика, без шаблонных AI-формулировок
- Пуш — только по явной просьбе владельца

// Схема БД Ranko — PLAN.md, раздел 5.
// Драйвер — Neon HTTP (см. src/lib/db/index.ts). Меняется только миграциями drizzle-kit.
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Статус решения: открыто для голосования или закрыто (досрочно или по дедлайну).
export const decisionStatus = pgEnum('decision_status', ['open', 'closed']);

// Решение — вопрос с вариантами. slug для публичной ссылки, adminToken для админ-доступа.
// Верхние границы длин полей — здесь (varchar); нижние границы валидирует zod на границе API (Фаза 2).
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 10 }).notNull().unique(),
  adminToken: varchar('admin_token', { length: 24 }).notNull(),
  title: varchar('title', { length: 120 }).notNull(),
  description: varchar('description', { length: 500 }),
  // Город решения — контекст для мест, заданных адресом текстом: по нему строим поиск на карте.
  // Местам, заданным ссылкой, город не нужен — точка в ссылке уже есть.
  city: varchar('city', { length: 80 }),
  status: decisionStatus('status').notNull().default('open'),
  deadline: timestamp('deadline', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Вариант ответа. position — порядок при создании (варианты замораживаются после первого голоса).
export const options = pgTable(
  'options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => decisions.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 80 }).notNull(),
    // Место варианта: либо ссылка на Яндекс.Карты, либо адрес текстом — одно поле на оба случая
    // (PLAN.md §8, Фаза 7). Что именно лежит, разбирает src/lib/place.ts при рендере.
    // 200 символов: короткая ссылка из «Поделиться» — около 35, адрес текстом влезает с запасом.
    place: varchar('place', { length: 200 }),
    position: integer('position').notNull(),
  },
  (t) => [index('options_decision_id_idx').on(t.decisionId)],
);

// Участник голосования. token возвращается только владельцу и никогда не отдаётся в GET (PLAN.md §4).
export const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => decisions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 40 }).notNull(),
    token: varchar('token', { length: 24 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('participants_decision_id_idx').on(t.decisionId)],
);

// Ранжировка: место (rank) варианта у участника. rank = 0 — самый желанный.
// Композитный PK (участник, вариант) + UNIQUE (участник, rank): у участника один вариант на место.
export const rankings = pgTable(
  'rankings',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => options.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.participantId, t.optionId] }),
    unique('rankings_participant_rank_unique').on(t.participantId, t.rank),
  ],
);

export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;

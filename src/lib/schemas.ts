// zod-схемы на каждой границе API (PLAN.md §6). Валидация входных данных живёт только здесь —
// route handlers доверяют уже разобранным данным. Верхние границы длин совпадают со схемой БД
// (src/lib/db/schema.ts), нижние (непустота) задаём тут.
import { z } from 'zod';

// POST /api/decisions — создание решения.
export const createDecisionSchema = z.object({
  title: z.string().trim().min(1, 'Введите заголовок').max(120, 'Заголовок не длиннее 120 символов'),
  description: z.string().trim().max(500, 'Описание не длиннее 500 символов').optional(),
  options: z
    .array(z.string().trim().min(1, 'Вариант не может быть пустым').max(80, 'Вариант не длиннее 80 символов'))
    .min(2, 'Нужно минимум 2 варианта')
    .max(20, 'Не больше 20 вариантов'),
  // ISO 8601 с допустимым смещением зоны; дедлайн должен быть в будущем — иначе решение родится закрытым.
  deadline: z
    .iso
    .datetime({ offset: true })
    .optional()
    .refine((v) => v === undefined || new Date(v).getTime() > Date.now(), {
      message: 'Дедлайн должен быть в будущем',
    }),
});

// POST /api/decisions/{slug}/participants — присоединение участника.
export const joinSchema = z.object({
  name: z.string().trim().min(1, 'Введите имя').max(40, 'Имя не длиннее 40 символов'),
});

// PUT /api/decisions/{slug}/vote — полная перестановка вариантов.
// order — это optionId[]; полнота набора (перестановка ровно всех вариантов решения) проверяется
// в хендлере против БД (иначе 422): здесь валидируем лишь форму.
export const voteSchema = z.object({
  participantToken: z.string().min(1, 'Отсутствует токен участника'),
  order: z.array(z.uuid('Некорректный идентификатор варианта')).min(1, 'Пустой порядок вариантов'),
});

// Тело админ-действий: close / delete decision / delete participant.
export const adminActionSchema = z.object({
  adminToken: z.string().min(1, 'Отсутствует админ-токен'),
});

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type JoinInput = z.infer<typeof joinSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
export type AdminActionInput = z.infer<typeof adminActionSchema>;

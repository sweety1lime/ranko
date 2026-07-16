// zod-схемы на каждой границе API (PLAN.md §6). Валидация входных данных живёт только здесь —
// route handlers доверяют уже разобранным данным. Верхние границы длин совпадают со схемой БД
// (src/lib/db/schema.ts), нижние (непустота) задаём тут.
import { z } from 'zod';
import { isPlaceUrl, yandexMapsUrl } from '@/lib/place';

// Вариант с опциональным местом (PLAN.md §8, Фаза 7). Место — либо ссылка на Яндекс.Карты,
// либо адрес текстом; ссылку проверяем сразу, чтобы админ узнал о негодной при создании,
// а не участник — по мёртвой кнопке «На карте».
const optionSchema = z.object({
  label: z.string().trim().min(1, 'Вариант не может быть пустым').max(80, 'Вариант не длиннее 80 символов'),
  place: z
    .string()
    .trim()
    .max(200, 'Место не длиннее 200 символов')
    .optional()
    .refine((v) => !v || !isPlaceUrl(v) || yandexMapsUrl(v) !== null, {
      message: 'Ссылка должна вести на Яндекс.Карты — скопируйте её кнопкой «Поделиться»',
    }),
});

// POST /api/decisions — создание решения.
export const createDecisionSchema = z.object({
  title: z.string().trim().min(1, 'Введите заголовок').max(120, 'Заголовок не длиннее 120 символов'),
  description: z.string().trim().max(500, 'Описание не длиннее 500 символов').optional(),
  city: z.string().trim().max(80, 'Город не длиннее 80 символов').optional(),
  options: z.array(optionSchema).min(2, 'Нужно минимум 2 варианта').max(20, 'Не больше 20 вариантов'),
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
// participantToken необязателен: личность может приехать httpOnly-cookie дублем (PLAN.md §4), а её
// клиент прочитать не может по определению. Хендлер требует хотя бы один источник — тело или cookie.
export const voteSchema = z.object({
  participantToken: z.string().min(1, 'Отсутствует токен участника').optional(),
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

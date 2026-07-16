// Тонкие хелперы для route handlers: единый JSON-ответ, разбор+валидация тела и timing-safe
// сравнение токенов. Хендлеры возвращают стандартный Response (не NextResponse), чтобы их можно
// было вызывать в тестах в чистом Node без Next-рантайма.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';

// Успешный JSON-ответ.
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

// Ошибка в едином формате { error } с честным HTTP-статусом (PLAN.md §6).
export function apiError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

// Читает JSON-тело запроса и валидирует его схемой. Битый JSON или несоответствие схеме → 400
// с готовым Response; иначе — разобранные данные. Сообщение об ошибке берём из первого issue zod.
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: apiError('Некорректный JSON в теле запроса', 400) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Некорректные данные';
    return { ok: false, response: apiError(message, 400) };
  }

  return { ok: true, data: parsed.data };
}

// Сравнение секретов за константное время. Хэшируем оба значения до фиксированной длины, поэтому
// сравнение не утекает даже длину токена. Используется для adminToken (PLAN.md §6).
export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

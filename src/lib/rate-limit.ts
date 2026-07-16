// Rate limit на создание решений (PLAN.md §6, §8 Фаза 5). Ограничитель один и тот же для двух
// хранилищ: в памяти процесса — по умолчанию, в Upstash Redis — если заданы его переменные окружения.
//
// Зачем гибрид: на Vercel у каждого инстанса своя память, поэтому лимит «в памяти» дырявый — он
// сдерживает случайный флуд, но не намеренный. Upstash считает честно и общо для всех инстансов.
// При этом требовать аккаунт Upstash ради локального запуска и тестов не хочется, а падать без него
// — тем более: создание решений это весь продукт. Отсюда правило — есть env, работаем строго;
// нет env, работаем как умеем.
import { apiError } from '@/lib/api';

// 10 решений за 10 минут на IP. Живому человеку столько подряд не нужно даже с опечатками,
// а скрипту уже мешает.
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export type RateLimiter = {
  check(key: string): Promise<RateLimitResult>;
};

// Fixed window в памяти процесса. Фабрика, а не синглтон: тесты создают свой инстанс со своими
// лимитом, окном и часами — и не зависят от того, что творится в модульном состоянии.
export function createRateLimiter(options: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
} = {}): RateLimiter {
  const { limit = LIMIT, windowMs = WINDOW_MS, now = Date.now } = options;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    async check(key: string): Promise<RateLimitResult> {
      const t = now();

      // Ленивая уборка: без неё Map растёт по одному ключу на IP навсегда. Чистим редко и целиком,
      // чтобы не платить обходом на каждом запросе.
      if (buckets.size > 1000) {
        for (const [k, bucket] of buckets) {
          if (bucket.resetAt <= t) buckets.delete(k);
        }
      }

      const bucket = buckets.get(key);

      // Окна нет или оно истекло — начинаем новое, текущий запрос в нём первый.
      if (!bucket || bucket.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + windowMs });
        return { ok: true };
      }

      if (bucket.count < limit) {
        bucket.count += 1;
        return { ok: true };
      }

      return { ok: false, retryAfterSec: retryAfterFrom(bucket.resetAt, t) };
    },
  };
}

// Тот же интерфейс поверх Upstash. Импортируем его динамически: без env-переменных пакет не нужен
// вовсе, и грузить его в рантайм (в том числе в тестах) незачем.
function createUpstashRateLimiter(url: string, token: string): RateLimiter {
  const ready = (async () => {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ]);

    return new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(LIMIT, `${WINDOW_MS} ms`),
      prefix: 'ranko:create',
    });
  })();

  return {
    async check(key: string): Promise<RateLimitResult> {
      const ratelimit = await ready;
      const { success, reset } = await ratelimit.limit(key);
      return success ? { ok: true } : { ok: false, retryAfterSec: retryAfterFrom(reset, Date.now()) };
    },
  };
}

// Retry-After в секундах, не меньше 1: ноль означал бы «можно прямо сейчас», а это неправда.
function retryAfterFrom(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Лимитер создания решений. Хранилище выбирается один раз при загрузке модуля.
export const createDecisionLimiter: RateLimiter =
  upstashUrl && upstashToken
    ? createUpstashRateLimiter(upstashUrl, upstashToken)
    : createRateLimiter();

// IP клиента для ключа лимита. На Vercel адрес приезжает в x-forwarded-for (первый элемент —
// исходный клиент, дальше прокси). 'unknown' — общий котёл для запросов без заголовков вовсе:
// лучше пусть они делят одно окно, чем не считаются совсем.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// Проверка лимита для route handler: либо null (пропускаем), либо готовый 429 с Retry-After.
export async function enforceCreateRateLimit(req: Request): Promise<Response | null> {
  const result = await createDecisionLimiter.check(clientIp(req));
  if (result.ok) return null;

  return apiError('Слишком много решений подряд. Попробуйте чуть позже.', 429, {
    'Retry-After': String(result.retryAfterSec),
  });
}

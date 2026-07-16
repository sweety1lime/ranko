// Юниты лимитера в памяти (PLAN.md §8, Фаза 5). Upstash-ветку здесь не трогаем: она про сеть,
// а не про логику окна — её проверит прод по env-переменным.
// Часы подменяем своей функцией now: тест про окно во времени не должен ничего ждать.
import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter, enforceCreateRateLimit } from '@/lib/rate-limit';

describe('createRateLimiter', () => {
  it('пропускает ровно limit запросов и отказывает следующему', async () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });

    expect(await limiter.check('ip')).toEqual({ ok: true });
    expect(await limiter.check('ip')).toEqual({ ok: true });
    expect(await limiter.check('ip')).toEqual({ ok: true });
    expect(await limiter.check('ip')).toEqual({ ok: false, retryAfterSec: 1 });
  });

  it('считает ключи независимо: сосед по IP не тратит чужое окно', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });

    expect(await limiter.check('первый')).toEqual({ ok: true });
    expect(await limiter.check('второй')).toEqual({ ok: true });
    expect(await limiter.check('первый')).toEqual({ ok: false, retryAfterSec: 1 });
  });

  it('открывает новое окно, когда прежнее истекло', async () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });

    expect(await limiter.check('ip')).toEqual({ ok: true });
    expect(await limiter.check('ip')).toEqual({ ok: false, retryAfterSec: 1 });

    now = 1000; // ровно граница окна — оно уже не действует
    expect(await limiter.check('ip')).toEqual({ ok: true });
  });

  it('в Retry-After отдаёт остаток окна, округлённый вверх', async () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => now });

    await limiter.check('ip');
    now = 2500; // до сброса 7.5 с — просить вернуться через 7 рано, отвечаем 8
    expect(await limiter.check('ip')).toEqual({ ok: false, retryAfterSec: 8 });
  });
});

describe('enforceCreateRateLimit', () => {
  // Здесь работает настоящий лимитер модуля (10 за 10 минут), а не свой инстанс: проверяем ровно
  // то, что увидит route handler. IP уникальный — чтобы тест не делил окно ни с кем.
  const req = () => new Request('http://test.local/api', { headers: { 'x-forwarded-for': '198.51.100.42' } });

  it('пропускает, пока есть запас, и отдаёт готовый 429 с Retry-After, когда запас кончился', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await enforceCreateRateLimit(req())).toBeNull();
    }

    const res = await enforceCreateRateLimit(req());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(Number(res!.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await res!.json()).error).toBeTruthy();
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://test.local', { headers });

  it('берёт первый адрес из x-forwarded-for — это клиент, дальше прокси', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe('203.0.113.7');
  });

  it('падает обратно на x-real-ip', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('без заголовков даёт общий ключ, а не пустую строку', () => {
    expect(clientIp(req({}))).toBe('unknown');
  });
});

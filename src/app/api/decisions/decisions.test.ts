// Интеграционные тесты ручек API (PLAN.md §6, Фаза 2). Гоняют реальные route handlers против
// PGlite (in-memory Postgres) — @/lib/db подменён на testDb через vi.mock. Проверяют полный сценарий
// «создать → присоединиться → проголосовать → результаты → закрыть» и ветки ошибок 400/403/404/422.
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Подменяем клиента БД на общий тестовый инстанс PGlite (тот же модуль-синглтон, что мигрируем ниже).
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/db')).testDb }));

// Лимитер здесь всегда пропускает. У тестовых запросов нет x-forwarded-for, значит все они делят
// один ключ и на десятке решений упёрлись бы в реальное окно — тесты сыпались бы 429 по порядку
// запуска, а не по существу. Само окно проверяется юнитами в src/lib/rate-limit.test.ts,
// а его подключение к ручке — в describe «rate limit» ниже.
vi.mock('@/lib/rate-limit', () => ({ enforceCreateRateLimit: vi.fn(async () => null) }));

import { POST as createDecision } from '@/app/api/decisions/route';
import { DELETE as deleteDecision, GET as getDecision } from '@/app/api/decisions/[slug]/route';
import { POST as joinDecision } from '@/app/api/decisions/[slug]/participants/route';
import { DELETE as deleteParticipant } from '@/app/api/decisions/[slug]/participants/[id]/route';
import { PUT as vote } from '@/app/api/decisions/[slug]/vote/route';
import { GET as getResults } from '@/app/api/decisions/[slug]/results/route';
import { POST as closeDecision } from '@/app/api/decisions/[slug]/close/route';
import { decisions } from '@/lib/db/schema';
import { enforceCreateRateLimit } from '@/lib/rate-limit';
import { ensureSchema, testDb, truncateAll } from '@/test/db';

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await truncateAll();
});

// --- Хелперы -------------------------------------------------------------------------------------

function jsonReq(body?: unknown, method = 'POST'): Request {
  return new Request('http://test.local/api', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Запрос с заголовком Cookie — для проверки httpOnly-дубля participantToken.
function jsonReqWithCookie(body: unknown, cookie: string, method = 'PUT'): Request {
  return new Request('http://test.local/api', {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

type Created = { slug: string; adminToken: string };

async function makeDecision(overrides: Record<string, unknown> = {}): Promise<Created> {
  const res = await createDecision(
    jsonReq({ title: 'Куда идём?', options: ['Пицца', 'Бар', 'Кино'], ...overrides }),
  );
  expect(res.status).toBe(201);
  return res.json();
}

// Возвращает id вариантов в порядке позиции (через публичный GET).
async function optionIdsOf(slug: string): Promise<string[]> {
  const res = await getDecision(jsonReq(undefined, 'GET'), ctx({ slug }));
  const body = await res.json();
  return body.options.map((o: { id: string }) => o.id);
}

async function join(slug: string, name: string): Promise<{ id: string; token: string }> {
  const res = await joinDecision(jsonReq({ name }), ctx({ slug }));
  expect(res.status).toBe(201);
  const body = await res.json();
  return { id: body.participantId, token: body.participantToken };
}

// --- Полный сценарий -----------------------------------------------------------------------------

describe('полный сценарий: создать → присоединиться → проголосовать → результаты → закрыть', () => {
  it('проходит целиком и корректно считает метод Борда', async () => {
    const { slug, adminToken } = await makeDecision();
    const [pizza, bar, kino] = await optionIdsOf(slug);

    // Публичное чтение не отдаёт секретов.
    const readRes = await getDecision(jsonReq(undefined, 'GET'), ctx({ slug }));
    const read = await readRes.json();
    expect(readRes.status).toBe(200);
    expect(read.status).toBe('open');
    expect(read.options).toHaveLength(3);
    expect(JSON.stringify(read)).not.toContain(adminToken);
    expect(read.participants).toEqual([]);

    // Двое участников голосуют.
    const anya = await join(slug, 'Аня');
    const boris = await join(slug, 'Борис');

    expect((await vote(jsonReq({ participantToken: anya.token, order: [pizza, bar, kino] }), ctx({ slug }))).status).toBe(200);
    expect((await vote(jsonReq({ participantToken: boris.token, order: [pizza, kino, bar] }), ctx({ slug }))).status).toBe(200);

    // Результаты: Пицца — явный победитель (по 2 первых места).
    const r1 = await (await getResults(jsonReq(undefined, 'GET'), ctx({ slug }))).json();
    expect(r1.status).toBe('open');
    expect(r1.winnerId).toBe(pizza);
    expect(r1.participantsCount).toBe(2);
    expect(r1.votedNames).toEqual(['Аня', 'Борис']);
    const points = Object.fromEntries(r1.tally.map((t: { optionId: string; points: number }) => [t.optionId, t.points]));
    expect(points).toEqual({ [pizza]: 4, [bar]: 1, [kino]: 1 });
    const pizzaEntry = r1.tally.find((t: { optionId: string }) => t.optionId === pizza);
    expect(pizzaEntry).toMatchObject({ firstPlaces: 2, lastPlaces: 0 });

    // Повторное голосование перезаписывает прежний порядок (не плодит ранжировки).
    expect((await vote(jsonReq({ participantToken: anya.token, order: [bar, pizza, kino] }), ctx({ slug }))).status).toBe(200);
    const r2 = await (await getResults(jsonReq(undefined, 'GET'), ctx({ slug }))).json();
    const points2 = Object.fromEntries(r2.tally.map((t: { optionId: string; points: number }) => [t.optionId, t.points]));
    expect(points2).toEqual({ [pizza]: 3, [bar]: 2, [kino]: 1 });
    expect(r2.votedNames).toEqual(['Аня', 'Борис']);

    // Админ закрывает голосование.
    const closeRes = await closeDecision(jsonReq({ adminToken }), ctx({ slug }));
    expect(closeRes.status).toBe(200);
    expect(await closeRes.json()).toEqual({ status: 'closed' });

    // После закрытия голосовать нельзя.
    const lateVote = await vote(jsonReq({ participantToken: anya.token, order: [pizza, bar, kino] }), ctx({ slug }));
    expect(lateVote.status).toBe(403);
    expect((await getResults(jsonReq(undefined, 'GET'), ctx({ slug })).then((r) => r.json())).status).toBe('closed');
  });
});

// --- Создание: валидация -------------------------------------------------------------------------

describe('POST /api/decisions — валидация', () => {
  it('пустой заголовок → 400', async () => {
    const res = await createDecision(jsonReq({ title: '   ', options: ['A', 'B'] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it('меньше двух вариантов → 400', async () => {
    const res = await createDecision(jsonReq({ title: 'Вопрос', options: ['Единственный'] }));
    expect(res.status).toBe(400);
  });

  it('дедлайн в прошлом → 400', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await createDecision(jsonReq({ title: 'Вопрос', options: ['A', 'B'], deadline: past }));
    expect(res.status).toBe(400);
  });

  it('битый JSON → 400', async () => {
    const req = new Request('http://test.local/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ не json',
    });
    expect((await createDecision(req)).status).toBe(400);
  });

  it('валидный будущий дедлайн принимается и виден в GET', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const { slug } = await makeDecision({ deadline: future });
    const read = await (await getDecision(jsonReq(undefined, 'GET'), ctx({ slug }))).json();
    expect(new Date(read.deadline).toISOString()).toBe(future);
  });
});

// --- Создание: rate limit ------------------------------------------------------------------------

describe('POST /api/decisions — rate limit', () => {
  it('отказ лимитера отдаётся клиенту как есть, и решение не создаётся', async () => {
    vi.mocked(enforceCreateRateLimit).mockResolvedValueOnce(
      Response.json({ error: 'Слишком много' }, { status: 429, headers: { 'Retry-After': '42' } }),
    );

    const res = await createDecision(jsonReq({ title: 'Вопрос', options: ['A', 'B'] }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');

    // Главное в этом тесте: до записи в БД дело не дошло — иначе лимит не лимит.
    expect(await testDb.select().from(decisions)).toHaveLength(0);
  });
});

// --- Заморозка вариантов (PLAN.md §2) ------------------------------------------------------------

describe('варианты заморожены после первого голоса (PLAN.md §2)', () => {
  it('ни одна ручка сценария не меняет набор вариантов', async () => {
    // Свойство держится по построению: options пишутся один раз при создании, и правящей их ручки
    // в §6 нет вовсе. Тест сторожит именно это — он покраснеет, если такая ручка когда-нибудь
    // появится без разговора про ранжировки, которые она сломает.
    const { slug, adminToken } = await makeDecision();
    const before = await optionIdsOf(slug);

    const anya = await join(slug, 'Аня');
    const boris = await join(slug, 'Борис');
    await vote(jsonReq({ participantToken: anya.token, order: before }), ctx({ slug }));
    await vote(jsonReq({ participantToken: boris.token, order: [...before].reverse() }), ctx({ slug }));
    await deleteParticipant(jsonReq({ adminToken }), ctx({ slug, id: boris.id }));
    await closeDecision(jsonReq({ adminToken }), ctx({ slug }));

    expect(await optionIdsOf(slug)).toEqual(before);
  });
});

// --- Голосование и присоединение: 403/422 --------------------------------------------------------

describe('голосование и присоединение — 403/422', () => {
  it('присоединение к закрытому решению → 403', async () => {
    const { slug, adminToken } = await makeDecision();
    await closeDecision(jsonReq({ adminToken }), ctx({ slug }));
    const res = await joinDecision(jsonReq({ name: 'Поздний' }), ctx({ slug }));
    expect(res.status).toBe(403);
  });

  it('неполный order → 422', async () => {
    const { slug } = await makeDecision();
    const [pizza, bar] = await optionIdsOf(slug);
    const p = await join(slug, 'Аня');
    const res = await vote(jsonReq({ participantToken: p.token, order: [pizza, bar] }), ctx({ slug }));
    expect(res.status).toBe(422);
  });

  it('чужой токен участника → 403', async () => {
    const { slug } = await makeDecision();
    const order = await optionIdsOf(slug);
    await join(slug, 'Аня');
    const res = await vote(jsonReq({ participantToken: 'definitely-not-a-token', order }), ctx({ slug }));
    expect(res.status).toBe(403);
  });

  it('голосование по неизвестному slug → 404', async () => {
    const res = await vote(jsonReq({ participantToken: 'x', order: [crypto.randomUUID()] }), ctx({ slug: 'nope' }));
    expect(res.status).toBe(404);
  });
});

// --- httpOnly-cookie дублем к participantToken (PLAN.md §4) --------------------------------------

describe('httpOnly-cookie дублем к participantToken (PLAN.md §4)', () => {
  it('присоединение кладёт токен в httpOnly-cookie, привязанную к решению', async () => {
    const { slug } = await makeDecision();
    const res = await joinDecision(jsonReq({ name: 'Аня' }), ctx({ slug }));
    const { participantToken } = await res.json();

    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain(`ranko_p_${slug}=${participantToken}`);
    expect(cookie).toContain('HttpOnly');
    // Lax — не косметика: cookie авторизует PUT /vote, без неё это был бы CSRF.
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('голос принимается по одной только cookie, когда токена в теле нет', async () => {
    const { slug } = await makeDecision();
    const order = await optionIdsOf(slug);
    const joinRes = await joinDecision(jsonReq({ name: 'Аня' }), ctx({ slug }));
    const cookie = joinRes.headers.get('set-cookie')!.split(';')[0];

    // Ровно сценарий вычищенного localStorage: клиент токена не знает и прислать его не может.
    const res = await vote(jsonReqWithCookie({ order }, cookie), ctx({ slug }));
    expect(res.status).toBe(200);

    const results = await (await getResults(jsonReq(undefined, 'GET'), ctx({ slug }))).json();
    expect(results.votedNames).toEqual(['Аня']);
    expect(results.participantsCount).toBe(1);
  });

  it('cookie от другого решения не даёт голосовать', async () => {
    const a = await makeDecision({ title: 'Решение А' });
    const b = await makeDecision({ title: 'Решение Б' });
    const joinRes = await joinDecision(jsonReq({ name: 'Аня' }), ctx({ slug: a.slug }));
    const cookieForA = joinRes.headers.get('set-cookie')!.split(';')[0];

    const orderB = await optionIdsOf(b.slug);
    const res = await vote(jsonReqWithCookie({ order: orderB }, cookieForA), ctx({ slug: b.slug }));
    expect(res.status).toBe(403);
  });

  it('без токена в теле и без cookie → 403', async () => {
    const { slug } = await makeDecision();
    const order = await optionIdsOf(slug);
    const res = await vote(jsonReq({ order }, 'PUT'), ctx({ slug }));
    expect(res.status).toBe(403);
  });

  it('токен из тела важнее cookie: чужая cookie не подменяет личность', async () => {
    const { slug } = await makeDecision();
    const order = await optionIdsOf(slug);
    const anya = await join(slug, 'Аня');
    const borisJoin = await joinDecision(jsonReq({ name: 'Борис' }), ctx({ slug }));
    const borisCookie = borisJoin.headers.get('set-cookie')!.split(';')[0];

    // Тело — Аня, cookie — Борис: голос должен уйти Ане.
    const res = await vote(
      jsonReqWithCookie({ participantToken: anya.token, order }, borisCookie),
      ctx({ slug }),
    );
    expect(res.status).toBe(200);

    const results = await (await getResults(jsonReq(undefined, 'GET'), ctx({ slug }))).json();
    expect(results.votedNames).toEqual(['Аня']);
  });
});

// --- Админ-действия: 403/404 и удаление ----------------------------------------------------------

describe('админ-действия — 403/404 и удаление', () => {
  it('закрытие и удаление чужим adminToken → 403', async () => {
    const { slug } = await makeDecision();
    expect((await closeDecision(jsonReq({ adminToken: 'wrong' }), ctx({ slug }))).status).toBe(403);
    expect((await deleteDecision(jsonReq({ adminToken: 'wrong' }), ctx({ slug }))).status).toBe(403);
  });

  it('неизвестный slug → 404 на чтении', async () => {
    const res = await getDecision(jsonReq(undefined, 'GET'), ctx({ slug: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('админ удаляет участника; чужой токен → 403, несуществующий → 404', async () => {
    const { slug, adminToken } = await makeDecision();
    const p = await join(slug, 'Спамер');

    expect((await deleteParticipant(jsonReq({ adminToken: 'wrong' }), ctx({ slug, id: p.id }))).status).toBe(403);

    const ok = await deleteParticipant(jsonReq({ adminToken }), ctx({ slug, id: p.id }));
    expect(ok.status).toBe(200);

    // Участник исчез из публичного списка.
    const read = await (await getDecision(jsonReq(undefined, 'GET'), ctx({ slug }))).json();
    expect(read.participants).toHaveLength(0);

    // Повторное удаление — уже 404.
    expect((await deleteParticipant(jsonReq({ adminToken }), ctx({ slug, id: p.id }))).status).toBe(404);
  });

  it('удаление решения каскадом; после — 404', async () => {
    const { slug, adminToken } = await makeDecision();
    await join(slug, 'Аня');
    const del = await deleteDecision(jsonReq({ adminToken }), ctx({ slug }));
    expect(del.status).toBe(200);
    expect((await getDecision(jsonReq(undefined, 'GET'), ctx({ slug }))).status).toBe(404);
  });
});

// --- Ленивое закрытие по дедлайну ----------------------------------------------------------------

describe('ленивое закрытие по дедлайну (PLAN.md §5)', () => {
  it('чтение после прошедшего дедлайна переводит статус в closed и запрещает голос', async () => {
    const { slug } = await makeDecision();
    const p = await join(slug, 'Аня');

    // Отматываем дедлайн в прошлое напрямую в БД (через API прошлый дедлайн не задать — refine запрещает).
    await testDb
      .update(decisions)
      .set({ deadline: new Date(Date.now() - 1000) })
      .where(eq(decisions.slug, slug));

    const results = await (await getResults(jsonReq(undefined, 'GET'), ctx({ slug }))).json();
    expect(results.status).toBe('closed');

    const order = await optionIdsOf(slug);
    const res = await vote(jsonReq({ participantToken: p.token, order }), ctx({ slug }));
    expect(res.status).toBe(403);
  });
});

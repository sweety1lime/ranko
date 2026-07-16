// httpOnly-cookie дублем к participantToken (PLAN.md §4). localStorage остаётся основным хранилищем
// личности, cookie — запасным: пережил чистку localStorage (или ITP выселил его) — участника всё
// равно узнаем, и он не проголосует вторым «призраком».
//
// Работаем на голых заголовках стандартного Request/Response, без next/headers: route handlers
// вызываются в тестах в чистом Node без Next-рантайма (см. комментарий в src/lib/api.ts).
//
// Почему SameSite=Lax обязателен: cookie — источник личности для PUT /vote, а значит без него
// любой сайт мог бы отправить голос от имени зашедшего к нему участника (CSRF). Lax прикладывает
// cookie только к навигации верхнего уровня, поэтому кросс-сайтовый fetch уедет без неё и получит
// 403, а переход по ссылке из мессенджера (обычный GET) работает.

const COOKIE_PREFIX = 'ranko_p_';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 дней — решение живёт дни, запас на возвраты

// Cookie — на каждое решение своя: участник может голосовать в нескольких решениях сразу.
// slug и token — nanoid (алфавит A-Za-z0-9_-), поэтому в имени и значении cookie они легальны
// как есть и не требуют экранирования.
export function participantCookieName(slug: string): string {
  return `${COOKIE_PREFIX}${slug}`;
}

export function buildParticipantCookie(slug: string, token: string): string {
  const attributes = [
    `${participantCookieName(slug)}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  // На проде — только по https; локально dev-сервер работает по http, и Secure убил бы cookie.
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}

// Достаёт токен участника для конкретного решения из заголовка Cookie. Имя cookie привязано к slug,
// поэтому cookie от чужого решения сюда не подойдёт по построению.
export function readParticipantCookie(req: Request, slug: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;

  const name = participantCookieName(slug);
  for (const chunk of header.split(';')) {
    const separator = chunk.indexOf('=');
    if (separator === -1) continue;
    if (chunk.slice(0, separator).trim() !== name) continue;

    const value = chunk.slice(separator + 1).trim();
    return value || null;
  }

  return null;
}

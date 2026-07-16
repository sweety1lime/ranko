// Личность участника на его же устройстве: participantToken + имя + отправленный порядок (PLAN.md §4).
// По токену узнаём вернувшегося участника и даём ему изменить голос, пока голосование открыто.
//
// Почему порядок лежит здесь, а не приходит с сервера: GET /api/decisions/{slug} ранжировки не отдаёт,
// а заводить ради этого новую ручку — выход за §6. Ограничение мнимое: токен и так живёт только
// в localStorage, значит вернуться участник может лишь в том же браузере — там же, где и порядок.

const KEY_PREFIX = 'ranko:participant:';

export type StoredParticipant = {
  token: string;
  name: string;
  // optionId[] последней успешной отправки; пусто, пока участник не проголосовал.
  order: string[];
};

function key(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

// Чтение терпимо к любому мусору в хранилище: приватный режим Safari, чужая запись по тому же ключу,
// формат из прошлой версии. Не разобрали — считаем, что участника нет: он просто введёт имя заново.
export function loadParticipant(slug: string): StoredParticipant | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { token, name, order } = parsed as Record<string, unknown>;
    if (typeof token !== 'string' || typeof name !== 'string') return null;

    return {
      token,
      name,
      order: Array.isArray(order) && order.every((id) => typeof id === 'string') ? order : [],
    };
  } catch {
    return null;
  }
}

export function saveParticipant(slug: string, participant: StoredParticipant): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key(slug), JSON.stringify(participant));
  } catch {
    // Хранилище недоступно или переполнено — не повод ронять голосование: участник просто
    // не будет узнан при следующем заходе.
  }
}

// Забыть участника: сервер не признал токен (админ удалил участника) — запись протухла.
export function clearParticipant(slug: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key(slug));
  } catch {
    // см. saveParticipant
  }
}

// Метод Борда — алгоритм компромисса Ranko (PLAN.md, раздел 3).
// Чистая функция без зависимостей от БД: на вход варианты + ранжировки, на выход расклад очков
// и победитель. Детерминированность гарантируется тем, что финальный тай-брейк использует
// сид = slug решения, поэтому результат не «прыгает» при поллинге страницы результатов.

export type BordaOption = { id: string; label: string };

// Ранжировка одного варианта одним участником. rank = 0 — самый желанный (топ).
export type BordaRanking = { participantId: string; optionId: string; rank: number };

export type TallyEntry = {
  optionId: string;
  label: string;
  points: number;
  firstPlaces: number;
  lastPlaces: number;
};

export type BordaResults = {
  tally: TallyEntry[];
  winnerId: string | null;
};

// Детерминированный 32-битный хэш (FNV-1a) — для воспроизводимого тай-брейка по сиду.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 в пределах uint32
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Считает расклад по методу Борда.
 * При N вариантах вариант с рангом r (0 = топ) получает N − 1 − r очков: топ = N−1, последний = 0.
 * Победитель — максимум очков; тай-брейк каскадом: больше первых мест → меньше последних мест →
 * детерминированный выбор по хэшу (seed + optionId), затем по optionId.
 *
 * @param seed slug решения — делает финальный тай-брейк воспроизводимым между вызовами.
 */
export function computeResults(
  options: BordaOption[],
  rankings: BordaRanking[],
  seed: string,
): BordaResults {
  const n = options.length;

  const tally: TallyEntry[] = options.map((o) => ({
    optionId: o.id,
    label: o.label,
    points: 0,
    firstPlaces: 0,
    lastPlaces: 0,
  }));

  if (n === 0) {
    return { tally, winnerId: null };
  }

  const byId = new Map<string, TallyEntry>(tally.map((e) => [e.optionId, e]));
  const lastRank = n - 1;

  for (const r of rankings) {
    const entry = byId.get(r.optionId);
    // Игнорируем ранжировки для несуществующих вариантов и мусорные ранги вне [0, n−1].
    if (!entry || r.rank < 0 || r.rank > lastRank) continue;
    entry.points += lastRank - r.rank;
    if (r.rank === 0) entry.firstPlaces += 1;
    if (r.rank === lastRank) entry.lastPlaces += 1;
  }

  // Без единого голоса победителя нет — сид-тай-брейк включается только когда есть ранжировки.
  if (rankings.length === 0) {
    return { tally, winnerId: null };
  }

  const winner = tally.reduce((best, cur) => (beats(cur, best, seed) ? cur : best));
  return { tally, winnerId: winner.optionId };
}

// Возвращает true, если a должен победить b по каскаду тай-брейков PLAN.md §3.
function beats(a: TallyEntry, b: TallyEntry, seed: string): boolean {
  if (a.points !== b.points) return a.points > b.points;
  if (a.firstPlaces !== b.firstPlaces) return a.firstPlaces > b.firstPlaces;
  if (a.lastPlaces !== b.lastPlaces) return a.lastPlaces < b.lastPlaces;
  const ha = fnv1a(seed + a.optionId);
  const hb = fnv1a(seed + b.optionId);
  if (ha !== hb) return ha > hb;
  // Крайне маловероятная коллизия хэшей — финальный детерминированный тай-брейк по id.
  return a.optionId > b.optionId;
}

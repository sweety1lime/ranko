import { describe, expect, it } from 'vitest';
import { computeResults, type BordaOption, type BordaRanking } from './borda';

// Хелпер: из бюллетеней (участник → варианты в порядке предпочтения, 0-й = топ) строит ранжировки.
function ballotsToRankings(ballots: Record<string, string[]>): BordaRanking[] {
  const rankings: BordaRanking[] = [];
  for (const [participantId, order] of Object.entries(ballots)) {
    order.forEach((optionId, rank) => rankings.push({ participantId, optionId, rank }));
  }
  return rankings;
}

const opts = (...ids: string[]): BordaOption[] => ids.map((id) => ({ id, label: id.toUpperCase() }));

function entry(res: ReturnType<typeof computeResults>, optionId: string) {
  const e = res.tally.find((t) => t.optionId === optionId);
  if (!e) throw new Error(`no tally entry for ${optionId}`);
  return e;
}

describe('computeResults — метод Борда', () => {
  it('обычный случай: явный победитель и корректный профиль очков', () => {
    const options = opts('a', 'b', 'c');
    const rankings = ballotsToRankings({
      p1: ['a', 'b', 'c'],
      p2: ['a', 'c', 'b'],
      p3: ['b', 'a', 'c'],
    });
    const res = computeResults(options, rankings, 'slug');

    // N=3: rank0→2, rank1→1, rank2→0 очков.
    expect(entry(res, 'a')).toMatchObject({ points: 5, firstPlaces: 2, lastPlaces: 0 });
    expect(entry(res, 'b')).toMatchObject({ points: 3, firstPlaces: 1, lastPlaces: 1 });
    expect(entry(res, 'c')).toMatchObject({ points: 1, firstPlaces: 0, lastPlaces: 2 });
    expect(res.winnerId).toBe('a');

    // tally сохраняет порядок вариантов и метки.
    expect(res.tally.map((t) => t.optionId)).toEqual(['a', 'b', 'c']);
    expect(entry(res, 'a').label).toBe('A');
  });

  it('тай-брейк по первым местам: очки равны, побеждает больше первых мест', () => {
    const options = opts('a', 'b', 'c');
    // Все трое набирают по 4 очка; у A два первых места против одного у B и C.
    const rankings = ballotsToRankings({
      p1: ['a', 'b', 'c'],
      p2: ['a', 'c', 'b'],
      p3: ['b', 'c', 'a'],
      p4: ['c', 'b', 'a'],
    });
    const res = computeResults(options, rankings, 'slug');

    expect(entry(res, 'a').points).toBe(4);
    expect(entry(res, 'b').points).toBe(4);
    expect(entry(res, 'c').points).toBe(4);
    expect(entry(res, 'a').firstPlaces).toBe(2);
    expect(entry(res, 'b').firstPlaces).toBe(1);
    expect(entry(res, 'c').firstPlaces).toBe(1);
    expect(res.winnerId).toBe('a');
  });

  it('тай-брейк по последним местам: очки и первые места равны, побеждает меньше последних мест', () => {
    const options = opts('a', 'b', 'c', 'd');
    // A и B — оба по 8 очков и по 2 первых места; у A нет последних мест, у B одно.
    const rankings = ballotsToRankings({
      p1: ['a', 'b', 'c', 'd'],
      p2: ['a', 'c', 'd', 'b'],
      p3: ['b', 'c', 'a', 'd'],
      p4: ['b', 'd', 'a', 'c'],
    });
    const res = computeResults(options, rankings, 'slug');

    expect(entry(res, 'a')).toMatchObject({ points: 8, firstPlaces: 2, lastPlaces: 0 });
    expect(entry(res, 'b')).toMatchObject({ points: 8, firstPlaces: 2, lastPlaces: 1 });
    expect(res.winnerId).toBe('a');
  });

  it('детерминированный сид: полная симметрия разрешается сидом, стабильно и воспроизводимо', () => {
    const options = opts('a', 'b');
    // Идеальная симметрия: очки, первые и последние места равны у A и B.
    const rankings = ballotsToRankings({ p1: ['a', 'b'], p2: ['b', 'a'] });

    expect(entry(computeResults(options, rankings, 'x'), 'a').points).toBe(1);
    expect(entry(computeResults(options, rankings, 'x'), 'b').points).toBe(1);

    // Один и тот же сид → один и тот же победитель (без «прыжков» при поллинге).
    const first = computeResults(options, rankings, 'my-slug').winnerId;
    const again = computeResults(options, rankings, 'my-slug').winnerId;
    expect(again).toBe(first);
    expect(first === 'a' || first === 'b').toBe(true);

    // Сид реально влияет: на наборе сидов победителями становятся оба варианта.
    const winners = new Set<string | null>();
    for (let i = 0; i < 100; i++) {
      winners.add(computeResults(options, rankings, `seed-${i}`).winnerId);
    }
    expect(winners.has('a')).toBe(true);
    expect(winners.has('b')).toBe(true);
  });

  it('один участник: победитель — его топ-вариант', () => {
    const options = opts('a', 'b', 'c');
    const rankings = ballotsToRankings({ p1: ['b', 'a', 'c'] });
    const res = computeResults(options, rankings, 'slug');

    expect(entry(res, 'b')).toMatchObject({ points: 2, firstPlaces: 1, lastPlaces: 0 });
    expect(entry(res, 'a').points).toBe(1);
    expect(entry(res, 'c')).toMatchObject({ points: 0, lastPlaces: 1 });
    expect(res.winnerId).toBe('b');
  });

  it('ноль участников: победителя нет, все очки нулевые', () => {
    const options = opts('a', 'b', 'c');
    const res = computeResults(options, [], 'slug');

    expect(res.winnerId).toBeNull();
    expect(res.tally).toHaveLength(3);
    for (const e of res.tally) {
      expect(e).toMatchObject({ points: 0, firstPlaces: 0, lastPlaces: 0 });
    }
  });

  it('ноль вариантов: пустой расклад, победителя нет', () => {
    const res = computeResults([], [], 'slug');
    expect(res.tally).toEqual([]);
    expect(res.winnerId).toBeNull();
  });
});

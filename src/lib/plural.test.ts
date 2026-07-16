import { describe, expect, it } from 'vitest';
import { plural } from './plural';

const points = (n: number) => `${n} ${plural(n, 'очко', 'очка', 'очков')}`;

describe('plural', () => {
  it('выбирает форму one для 1', () => {
    expect(points(1)).toBe('1 очко');
  });

  it('выбирает форму few для 2..4', () => {
    expect(points(2)).toBe('2 очка');
    expect(points(4)).toBe('4 очка');
  });

  it('выбирает форму many для 0 и 5..10', () => {
    expect(points(0)).toBe('0 очков');
    expect(points(5)).toBe('5 очков');
    expect(points(10)).toBe('10 очков');
  });

  it('знает про исключение 11..14', () => {
    expect(points(11)).toBe('11 очков');
    expect(points(12)).toBe('12 очков');
    expect(points(14)).toBe('14 очков');
  });

  it('считает по последней цифре за пределами первой сотни', () => {
    expect(points(21)).toBe('21 очко');
    expect(points(22)).toBe('22 очка');
    expect(points(25)).toBe('25 очков');
    expect(points(111)).toBe('111 очков');
    expect(points(121)).toBe('121 очко');
  });
});

import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('от одного слова берёт одну букву', () => {
    expect(initials('Аня')).toBe('А');
  });

  it('от двух слов — по первой букве каждого', () => {
    expect(initials('Анна Каренина')).toBe('АК');
  });

  it('дальше второго слова не идёт', () => {
    expect(initials('Пётр Ильич Чайковский')).toBe('ПИ');
  });

  it('переводит в верхний регистр', () => {
    expect(initials('вася пупкин')).toBe('ВП');
  });

  it('не спотыкается о лишние пробелы', () => {
    expect(initials('  вася   пупкин  ')).toBe('ВП');
  });

  it('на пустом имени возвращает пустую строку', () => {
    expect(initials('   ')).toBe('');
  });

  it('эмодзи не разваливает на суррогатную пару', () => {
    expect(initials('🎉 Аня')).toBe('🎉А');
  });
});

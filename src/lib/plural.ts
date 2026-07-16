// Русская плюрализация для подписей вроде «3 очка» / «5 очков» (PLAN.md §7: расклад надо не только
// показать, но и объяснить словами). Формы: one — 1 очко, few — 2 очка, many — 5 очков.
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;

  // 11..14 — исключение: «11 очков», хотя последняя цифра просит форму one/few.
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

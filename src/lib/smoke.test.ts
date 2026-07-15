import { describe, expect, it } from 'vitest';

// Smoke-тест Фазы 0: доказывает, что раннер тестов настроен и зелёный.
// Реальные юнит-тесты алгоритма Борда появятся в Фазе 1 (src/lib/borda.test.ts).
describe('smoke', () => {
  it('окружение тестов работает', () => {
    expect(1 + 1).toBe(2);
  });
});

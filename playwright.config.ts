// Playwright: один сквозной сценарий из PLAN.md §8 (Фаза 5) — критерий готовности фазы.
// Гоняем против живой базы из .env.local: прод-драйвер Neon HTTP к локальному Postgres не подключить,
// а PGlite из тестов ручек живёт в памяти vitest и до dev-сервера не достаёт. Сценарий убирает
// за собой созданное решение сам.
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Сценарий ходит в общую базу: параллельные прогоны мешали бы друг другу.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // Основной сценарий продукта — ссылка из мессенджера на телефоне (PLAN.md §7), поэтому и проверяем
  // в мобильном вьюпорте, а не в десктопном.
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // Локально переиспользуем уже поднятый dev-сервер, в CI поднимаем свой.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

// Скриншоты для README (PLAN.md §8, Фаза 6). Запуск: сначала npm run dev, потом npm run screenshots.
//
// Отдельным скриптом, а не спекой Playwright: npm run test:e2e — это проверка, она не должна
// переписывать файлы в репозитории. Здесь наоборот, запись картинок и есть смысл запуска.
//
// Ходит тем же путём, что и живой человек (создать → проголосовать → результаты), поэтому в README
// попадает настоящий продукт, а не сверстанная для картинки заглушка. Как и e2e, работает против
// живой базы из .env.local и убирает созданное решение за собой.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');

const TITLE = 'Куда идём в пятницу?';
const OPTIONS = ['Пиццерия на углу', 'Новый бар у реки', 'Кино в центре'];

// Три бюллетеня: у каждого свой фаворит, но пиццерия — у двоих, чтобы на картинке был
// внятный победитель и живой расклад, а не скучная ничья.
const BALLOTS = [
  { name: 'Аня', favourite: 'Пиццерия на углу' },
  { name: 'Борис', favourite: 'Новый бар у реки' },
  { name: 'Вера', favourite: 'Пиццерия на углу' },
];

// Кадр без следов дев-режима: значок дев-тулзов Next.js висит поверх страницы и наезжает на футер,
// а в README должен попасть продукт, а не наша локальная машина. В прод-сборке его нет вовсе.
async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' });
  await page.screenshot({ path: join(outDir, name), fullPage: true });
}

async function main() {
  await mkdir(outDir, { recursive: true });

  // Основной сценарий продукта — ссылка из мессенджера на телефоне (PLAN.md §7), поэтому и
  // скриншоты мобильные, тот же Pixel 5, что и в playwright.config.ts.
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await context.newPage();

  let cleanup: (() => Promise<void>) | null = null;

  try {
    // --- 1. Лендинг: форма, заполненная как перед отправкой ---
    await page.goto(`${baseURL}/`);
    await page.getByLabel('Вопрос').fill(TITLE);
    await page.getByRole('button', { name: 'Вариант', exact: true }).click();
    for (const [index, option] of OPTIONS.entries()) {
      await page.getByRole('textbox', { name: `Вариант ${index + 1}`, exact: true }).fill(option);
    }
    await shoot(page, 'create.png');

    await page.getByRole('button', { name: 'Создать решение' }).click();
    const links = page.locator('code');
    const publicUrl = (await links.nth(0).innerText()).trim();
    const adminUrl = (await links.nth(1).innerText()).trim();
    const slug = new URL(publicUrl).pathname.split('/').pop()!;
    const adminToken = new URL(adminUrl).searchParams.get('token')!;

    cleanup = async () => {
      await context.request.delete(`${baseURL}/api/decisions/${slug}`, { data: { adminToken } });
    };

    // --- 2. Голосование: каждому участнику свой контекст ---
    // Личность живёт в localStorage и httpOnly-cookie: в общем контексте участники перетирали бы
    // друг друга и голос остался бы один (та же причина, что в e2e/flow.spec.ts).
    for (const [index, ballot] of BALLOTS.entries()) {
      const voterContext = await browser.newContext({ ...devices['Pixel 5'] });
      try {
        const voter = await voterContext.newPage();
        await voter.goto(`${baseURL}/d/${slug}`);
        await voter.getByLabel('Как вас зовут?').fill(ballot.name);
        await voter.getByRole('button', { name: 'Участвовать' }).click();

        const up = voter.getByRole('button', { name: `Переместить «${ballot.favourite}» вверх` });
        while (await up.isEnabled()) {
          await up.click();
        }

        // Кадр экрана ранжирования снимаем у первого участника — до отправки, пока список на виду.
        if (index === 0) {
          await shoot(voter, 'vote.png');
        }

        await voter.getByRole('button', { name: 'Отправить' }).click();
        await voter.getByText('Голос учтён').waitFor();
      } finally {
        await voterContext.close();
      }
    }

    // --- 3. Результаты: победитель, расклад, кто проголосовал ---
    await page.goto(`${baseURL}/d/${slug}/results`);
    await page.getByText(`Проголосовали ${BALLOTS.length} из ${BALLOTS.length}`).waitFor();
    await shoot(page, 'results.png');

    console.log(`Готово: create.png, vote.png, results.png → ${outDir}`);
  } finally {
    // База живая — демо-решение убираем в любом случае, даже если кадр не снялся.
    if (cleanup) await cleanup();
    await context.close();
    await browser.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Скриншоты не сняты:', err);
    console.error(`Поднят ли dev-сервер на ${baseURL}? Запусти npm run dev в соседнем окне.`);
    process.exit(1);
  });

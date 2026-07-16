// Сквозной сценарий PLAN.md §8 (Фаза 5): создать → 2 участника → результаты → закрыть.
// Это единственный e2e в проекте, и он нарочно идёт продуктовым путём: только то, что видит и
// нажимает человек, — никаких прямых вызовов API, кроме уборки за собой в конце.
import { expect, test, type BrowserContext } from '@playwright/test';

const OPTIONS = ['Пицца', 'Бар', 'Кино'];

// Два способа задать место (Фаза 7): «Пицце» — ссылка из «Поделиться», «Бару» — адрес текстом.
// Второй способ и есть единственная причина, по которой у решения бывает город.
const PIZZA_PLACE = 'https://yandex.ru/maps/-/CDeaZL0X';
const BAR_PLACE = 'Большая Дмитровка 32';
const CITY = 'Москва';

// Заголовок уникальный на прогон: база живая и общая, а два прогона подряд не должны путаться
// в собственных решениях.
const title = () => `E2E: куда идём? ${Date.now()}`;

// Участник целиком: открыть ссылку из «чата», представиться, поднять свой любимый вариант наверх
// стрелками и отправить. Стрелки, а не драг: у dnd-kit на тач-эмуляции драг капризен, а перестановка
// у обеих дверей одна и та же (rank-list.tsx) — сценарий проверяет путь участника, а не dnd-kit.
async function voteAs(context: BrowserContext, slug: string, name: string, favourite: string) {
  const page = await context.newPage();
  await page.goto(`/d/${slug}`);

  await page.getByLabel('Как вас зовут?').fill(name);
  await page.getByRole('button', { name: 'Участвовать' }).click();

  // Место видно прямо в карточке — ради этого Фаза 7 и затевалась: выбирать вслепую нельзя.
  // Ссылка ведёт на саму точку.
  const map = page.getByRole('link', { name: 'На карте — открыть на карте' });
  await expect(map).toHaveAttribute('href', PIZZA_PLACE);
  await expect(map).toHaveAttribute('target', '_blank');

  // Адрес текстом виден как адрес и уходит в поиск по карте, сузившись городом решения.
  const search = page.getByRole('link', { name: `${BAR_PLACE} — открыть на карте` });
  await expect(search).toHaveAttribute(
    'href',
    `https://yandex.ru/maps/?text=${encodeURIComponent(`${CITY}, ${BAR_PLACE}`)}`,
  );

  // «Кино» осталось без места — карточка без ссылки, как и до Фазы 7.
  await expect(page.getByRole('link', { name: /открыть на карте/ })).toHaveCount(2);

  // Поднимаем избранника на первое место: жмём «вверх», пока кнопка не выключится (значит, он первый).
  const up = page.getByRole('button', { name: `Переместить «${favourite}» вверх` });
  await expect(up).toBeVisible();
  while (await up.isEnabled()) {
    await up.click();
  }

  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Голос учтён')).toBeVisible();

  return page;
}

test('создать → два участника голосуют → результаты → закрыть', async ({ page, browser, request }) => {
  const question = title();

  // --- Создатель заполняет форму на лендинге ---
  await page.goto('/');
  await page.getByLabel('Вопрос').fill(question);
  await page.getByLabel('Город (необязательно)').fill(CITY);

  // Форма стартует с двух полей — третий вариант добавляем кнопкой, как это делает человек.
  await page.getByRole('button', { name: 'Вариант', exact: true }).click();
  for (const [index, option] of OPTIONS.entries()) {
    // Именно textbox и точное имя: рядом живёт кнопка «Удалить вариант N», и подстрокой ловятся оба.
    await page.getByRole('textbox', { name: `Вариант ${index + 1}`, exact: true }).fill(option);
  }

  // Поле места спрятано за «+ место» — раскрываем его так же, как человек. «Кино» оставляем
  // без места: оно проверяет, что вариант без адреса выглядит как раньше.
  await page.getByRole('button', { name: 'Добавить место для варианта 1' }).click();
  await page.getByLabel('Место для варианта 1').fill(PIZZA_PLACE);
  await page.getByRole('button', { name: 'Добавить место для варианта 2' }).click();
  await page.getByLabel('Место для варианта 2').fill(BAR_PLACE);

  await page.getByRole('button', { name: 'Создать решение' }).click();
  await expect(page.getByText('Решение готово')).toBeVisible();

  // Обе ссылки показаны через CopyLink — в порядке «участникам, админу» (create-form.tsx).
  const links = page.locator('code');
  const publicUrl = (await links.nth(0).innerText()).trim();
  const adminUrl = (await links.nth(1).innerText()).trim();

  const slug = new URL(publicUrl).pathname.split('/').pop()!;
  const adminToken = new URL(adminUrl).searchParams.get('token')!;
  expect(slug).toHaveLength(10);

  try {
    // --- Двое участников голосуют по-разному ---
    // Каждому свой контекст: личность живёт в localStorage и httpOnly-cookie, в общем контексте
    // второй участник просто перетёр бы первого и голос был бы один.
    const anyaContext = await browser.newContext();
    const borisContext = await browser.newContext();

    try {
      await voteAs(anyaContext, slug, 'Аня', 'Пицца');
      await voteAs(borisContext, slug, 'Борис', 'Пицца');

      // --- Страница результатов видит обоих ---
      const results = await anyaContext.newPage();
      await results.goto(`/d/${slug}/results`);

      await expect(results.getByText('Проголосовали 2 из 2')).toBeVisible();
      await expect(results.getByText('Сейчас впереди')).toBeVisible();
      // Пицца — первая у обоих, значит победитель однозначен, без тай-брейка.
      await expect(results.getByRole('heading', { name: 'Пицца' })).toBeVisible();
      // «Куда идём» без «куда» — половина ответа: у победителя есть ссылка на место.
      await expect(results.getByRole('link', { name: 'На карте — открыть на карте' })).toHaveAttribute(
        'href',
        PIZZA_PLACE,
      );

      // --- Админ закрывает голосование ---
      await page.goto(adminUrl);
      await page.getByRole('button', { name: 'Закрыть голосование' }).click();
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await expect(page.getByText('Голосование закрыто — участники видят только результаты')).toBeVisible();

      // --- После закрытия голосовать некуда: ссылка ведёт на итоги (PLAN.md §2 п.5) ---
      const late = await borisContext.newPage();
      await late.goto(`/d/${slug}`);
      await expect(late).toHaveURL(new RegExp(`/d/${slug}/results$`));
      await expect(late.getByText('Голосование закрыто — итоги окончательные')).toBeVisible();
      await expect(late.getByText('Победил')).toBeVisible();
    } finally {
      await anyaContext.close();
      await borisContext.close();
    }
  } finally {
    // База живая — мусор за собой убираем в любом случае, даже если проверка выше упала.
    await request.delete(`/api/decisions/${slug}`, { data: { adminToken } });
  }
});

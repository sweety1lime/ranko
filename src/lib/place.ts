// Место варианта (PLAN.md §8, Фаза 7). В options.place лежит одно из двух: ссылка на Яндекс.Карты,
// которую админ скопировал кнопкой «Поделиться», либо адрес текстом. Что именно — разбираем здесь.
// Чистые функции без БД и React: их же зовёт zod на границе API и рендер карточек.
//
// Геосаджест не подключаем сознательно (PLAN.md §8): на бесплатном тарифе хранить полученные
// через API данные нельзя. Ссылка, скопированная человеком с публичного сайта, под это не подпадает.

// Домены Яндекса, которым доверяем. Пускаем сам домен и его поддомены (maps.yandex.ru), но
// сравниваем не через `includes`: `evil-yandex.ru` не должен пройти как «содержит yandex.ru».
const YANDEX_DOMAINS = ['yandex.ru', 'yandex.com', 'yandex.by', 'yandex.kz', 'yandex.com.tr'];

const SEARCH_BASE = 'https://yandex.ru/maps/';

// Похоже ли место на ссылку. Именно «похоже»: решаем лишь, каким путём разбирать строку дальше —
// валидность проверяет yandexMapsUrl. Ловим любую URI-схему, а не только https: иначе `http://…`
// и `javascript:…` не считались бы ссылками и уехали бы в поиск по карте как адрес — вместо
// честной ошибки о неподходящей ссылке. Адресу текстом схема взяться неоткуда: перед двоеточием
// должно идти слитное латинское слово, а в «Тверская 3, вход со двора» его нет.
export function isPlaceUrl(place: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(place.trim());
}

function isYandexHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return YANDEX_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// Единственный валидатор ссылки на место. Возвращает разобранный URL или null, если ссылке
// нельзя доверять. Null — это «не показывать ссылку вовсе», а не «показать как есть»:
// href из пользовательского ввода без проверки — прямая дыра под javascript:.
export function yandexMapsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  // Только https: http утёк бы в открытый редирект с нашей страницы, остальные схемы
  // (javascript:, data:) — исполняемый код в href.
  if (url.protocol !== 'https:') return null;
  if (!isYandexHost(url.hostname)) return null;

  // На maps.yandex.* картами является весь хост; на yandex.ru карты живут в /maps —
  // иначе сюда пролезет любая страница Яндекса, включая поиск и Диск.
  const hostIsMaps = url.hostname.toLowerCase().startsWith('maps.');
  if (!hostIsMaps && !/^\/maps(\/|$)/.test(url.pathname)) return null;

  return url;
}

// href для ссылки «На карте» или null, если места нет либо ссылке нельзя доверять.
// Ссылка ведёт на точку; адрес текстом — в поиск по карте, сузив его городом решения.
export function placeMapHref(place: string | null, city: string | null): string | null {
  const value = place?.trim();
  if (!value) return null;

  if (isPlaceUrl(value)) {
    return yandexMapsUrl(value)?.toString() ?? null;
  }

  const query = [city?.trim(), value].filter(Boolean).join(', ');
  return `${SEARCH_BASE}?text=${encodeURIComponent(query)}`;
}

// Что написать в ссылке. Адрес человек прочитает, а сырой URL в карточке — визуальный мусор,
// ради избавления от которого место и переехало из label в отдельное поле.
export function placeLinkText(place: string): string {
  const value = place.trim();
  return isPlaceUrl(value) ? 'На карте' : value;
}

// Фетчер для SWR (PLAN.md §4: поллинг через SWR c refreshInterval).
// Ручки отдают ошибки единым форматом { error } (src/lib/api.ts), поэтому текст для UI берём оттуда,
// а не из res.statusText.
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);

  if (!res.ok) {
    const message = await res
      .json()
      .then((body) => body?.error)
      .catch(() => null);
    throw new Error(message ?? 'Не удалось загрузить данные');
  }

  return res.json();
}

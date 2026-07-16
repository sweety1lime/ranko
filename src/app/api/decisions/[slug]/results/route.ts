// GET /api/decisions/{slug}/results — текущий расклад по методу Борда (PLAN.md §6).
import { apiError, json } from '@/lib/api';
import { getResults } from '@/lib/results';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const results = await getResults(slug);
  if (!results) return apiError('Решение не найдено', 404);
  return json(results);
}

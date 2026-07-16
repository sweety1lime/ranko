// POST /api/decisions — создание решения (PLAN.md §6).
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { decisions, options } from '@/lib/db/schema';
import { json, readJson } from '@/lib/api';
import { generateUniqueSlug } from '@/lib/decisions';
import { enforceCreateRateLimit } from '@/lib/rate-limit';
import { createDecisionSchema } from '@/lib/schemas';

export async function POST(req: Request): Promise<Response> {
  // Лимит проверяем до разбора тела: смысл ограничения — не пустить дальше, а не оценить качество
  // запроса. Флудеру честнее ответить 429, чем 400 на его же мусоре.
  const limited = await enforceCreateRateLimit(req);
  if (limited) return limited;

  const parsed = await readJson(req, createDecisionSchema);
  if (!parsed.ok) return parsed.response;
  const { title, description, options: labels, deadline } = parsed.data;

  const slug = await generateUniqueSlug();
  const adminToken = nanoid(24);

  const [decision] = await db
    .insert(decisions)
    .values({
      slug,
      adminToken,
      title,
      description: description ? description : null,
      deadline: deadline ? new Date(deadline) : null,
    })
    .returning({ id: decisions.id });

  await db
    .insert(options)
    .values(labels.map((label, position) => ({ decisionId: decision.id, label, position })));

  // adminToken отдаём один раз создателю — дальше он живёт в админ-ссылке (PLAN.md §2).
  return json({ slug, adminToken }, 201);
}

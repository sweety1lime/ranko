// OG-превью решения (PLAN.md §2 п.6, §4): ссылку кидают в чат, и там она должна разворачиваться
// вопросом, а не голым доменом. Картинку наследуют и вложенные экраны (/results, /admin) — метаданные
// в Next мержатся вниз по дереву.
//
// Шрифт не подключаем: дефолтный у @vercel/og — тот же Geist, что и на сайте, и кириллицу он покрывает
// (проверено по cmap). Начертание в нём одно, Regular, поэтому иерархию строим размером и цветом,
// а не жирностью — satori всё равно не синтезирует то, чего нет в файле.
// Цвета — hex-эквиваленты токенов из globals.css: satori не понимает oklch.
import { ImageResponse } from 'next/og';
import { getDecisionView } from '@/lib/decisions';
import { plural } from '@/lib/plural';

export const alt = 'Вопрос для голосования в Ranko';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const FOREGROUND = '#0a0a0a';
const MUTED = '#737373';
const BORDER = '#e5e5e5';

// Длинный вопрос (до 120 символов по схеме) не должен ни вылезать, ни съёживаться в нечитаемое:
// подбираем кегль под длину, а совсем длинный хвост обрезаем многоточием.
function titleFontSize(title: string): number {
  if (title.length <= 40) return 76;
  if (title.length <= 80) return 62;
  return 52;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decision = await getDecisionView(slug);

  // Решения нет (удалили, опечатались в ссылке) — отдаём нейтральную карточку вместо ошибки:
  // скрапер мессенджера не должен видеть 500 там, где человек увидит 404.
  const title = decision?.title ?? 'Ranko';
  const subtitle = decision
    ? `${decision.options.length} ${plural(decision.options.length, 'вариант', 'варианта', 'вариантов')} · голосование без регистрации`
    : 'Групповые решения без споров';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, color: MUTED }}>RANKO</div>

        <div
          style={{
            // lineClamp у satori работает только на -webkit-box, как и в браузере.
            display: '-webkit-box',
            fontSize: titleFontSize(title),
            lineHeight: 1.15,
            color: FOREGROUND,
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: MUTED,
            borderTop: `2px solid ${BORDER}`,
            paddingTop: 28,
          }}
        >
          {subtitle}
        </div>
      </div>
    ),
    size,
  );
}

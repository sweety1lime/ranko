import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Абсолютный адрес сайта нужен OG-превью: в разметку должна уйти полная ссылка на картинку, иначе
// мессенджер её не заберёт. На Vercel адрес приезжает в VERCEL_URL (без схемы), но у превью-деплоев
// он свой на каждый пуш — поэтому боевой адрес задаётся NEXT_PUBLIC_SITE_URL и имеет приоритет.
function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`);
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Ranko",
  description:
    "Групповые решения без споров: один вопрос, ссылка друзьям — честный компромисс за 30 секунд.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

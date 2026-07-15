import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

// Явно фиксируем корень воркспейса: рядом с домашней папкой есть посторонний
// package-lock.json, из-за которого Next иначе выбирает неверный root.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;

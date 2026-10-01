import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone нужен Docker; локальный/CI build запускается через next start.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    // HTML не кэшируем: браузер всегда получает актуальную разметку со
    // ссылками на хэшированные чанки (_next/static остаются immutable).
    // Иначе протухший HTML может ссылаться на старые/усечённые CSS-чанки,
    // которые браузер не ревалидирует даже по Ctrl+Shift+R.
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;

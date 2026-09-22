import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone нужен Docker; локальный/CI build запускается через next start.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

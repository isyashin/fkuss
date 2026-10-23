import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone нужен Docker; локальный/CI build запускается через next start.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    // HTML ревалидируется; персональные ответы заказов вообще не хранятся.
    return [
      { source: "/:path*", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/api/delivery/slots", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/api/order/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Vary", value: "Cookie" }] },
    ];
  },
};
export default nextConfig;

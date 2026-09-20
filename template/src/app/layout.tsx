import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { getSiteRestaurant, getSiteTheme } from "@/lib/site";
import { themeCssVars } from "@/lib/theme";
import { SiteHeader } from "@/components/site-header";
import { InstallPrompt } from "@/components/install-prompt";
import { OfflineBanner } from "@/components/offline-banner";
import "./globals.css";

const headingFont = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin", "cyrillic"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const restaurant = await getSiteRestaurant();
  let version = "1";
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const raw = await readFile(path.join(process.cwd(), "content", "icons", "icons.json"), "utf-8");
    version = (JSON.parse(raw) as { version?: string }).version ?? "1";
  } catch {
    // до первой генерации иконок
  }

  return {
    title: restaurant.seo.title || restaurant.name,
    description: restaurant.seo.description,
    icons: {
      apple: `/content-asset/icons/apple-touch-icon.png?v=${version}`,
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getSiteTheme();
  const vars = themeCssVars(theme);
  const style = Object.entries(vars)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  const bg = theme.background;
  const showBg = bg?.enabled && bg.image;
  const bgStyle = showBg
    ? `html body { background-image: linear-gradient(rgba(0,0,0,${(bg.dimPercent / 100).toFixed(2)}), rgba(0,0,0,${(bg.dimPercent / 100).toFixed(2)})), url('/content-asset/${bg.image}'); background-size: cover; background-position: ${bg.position === "top" ? "center top" : bg.position === "bottom" ? "center bottom" : "center"}; background-attachment: fixed; }` +
      (bg.disableOnMobile
        ? ` @media (max-width: 768px) { html body { background-image: none; } }`
        : "")
    : "";

  return (
    <html
      lang="ru"
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
      data-preset={theme.preset}
    >
      <head>
        <style>{`:root { ${style} }${bgStyle}`}</style>
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <InstallPrompt />
        <OfflineBanner />
      </body>
    </html>
  );
}

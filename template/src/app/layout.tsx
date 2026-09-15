import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { getSiteRestaurant, getSiteTheme } from "@/lib/site";
import { themeCssVars } from "@/lib/theme";
import { SiteHeader } from "@/components/site-header";
import { InstallPrompt } from "@/components/install-prompt";
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
  return {
    title: restaurant.seo.title || restaurant.name,
    description: restaurant.seo.description,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getSiteTheme();
  const vars = themeCssVars(theme);
  const style = Object.entries(vars)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  return (
    <html
      lang="ru"
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
      data-preset={theme.preset}
    >
      <head>
        <style>{`:root { ${style} }`}</style>
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}

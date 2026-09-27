import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Очаг Grill — панель администратора",
  description: "Управление рестораном Очаг Grill",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}

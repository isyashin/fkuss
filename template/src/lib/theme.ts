import type { ThemeConfig } from "./content";

export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  radius: string;
}

const PRESETS: Record<ThemeConfig["preset"], ThemeTokens> = {
  warm: {
    background: "#faf7f2",
    foreground: "#292019",
    card: "#ffffff",
    muted: "#6b5d4f",
    radius: "0.75rem",
  },
  minimal: {
    background: "#ffffff",
    foreground: "#18181b",
    card: "#fafafa",
    muted: "#71717a",
    radius: "0.375rem",
  },
  elegant: {
    background: "#131110",
    foreground: "#f3ede6",
    card: "#1d1a18",
    muted: "#a89c90",
    radius: "0.5rem",
  },
};

const RADIUS_MAP = { sharp: "0.125rem", soft: "0.75rem", round: "1.25rem" } as const;

/** CSS-переменные темы для подстановки в :root */
export function themeCssVars(theme: ThemeConfig): Record<string, string> {
  const preset = PRESETS[theme.preset] ?? PRESETS.warm;
  return {
    "--background": preset.background,
    "--foreground": preset.foreground,
    "--card": preset.card,
    "--muted": preset.muted,
    "--accent": theme.accent,
    "--radius": RADIUS_MAP[theme.radius] ?? preset.radius,
  };
}

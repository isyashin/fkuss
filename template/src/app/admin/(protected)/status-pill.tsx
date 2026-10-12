import rd from "./admin-redesign.module.css";

/** Статус-пилюля прототипа (точка + тон). Тоны: neutral, new, working, success, warn, danger, source. */
export function StatusPill({ tone, children }: { tone: "neutral" | "new" | "working" | "success" | "warn" | "danger" | "source"; children: React.ReactNode }) {
  const className = {
    neutral: rd.chipNeutral,
    new: rd.chipNew,
    working: rd.chipWorking,
    success: rd.chipSuccess,
    warn: rd.chipWarn,
    danger: rd.chipDanger,
    source: rd.chipSource,
  }[tone];
  return <span className={`${rd.chip} ${className}`}>{children}</span>;
}

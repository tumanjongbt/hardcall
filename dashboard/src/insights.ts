import type { InsightRow } from "./types";

export type InsightTone = "up" | "down" | "flat";

export function insightTone(value: string): InsightTone {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return "up";
  if (trimmed.startsWith("-") || trimmed.startsWith("−") || trimmed.startsWith("–")) {
    return "down";
  }
  return "flat";
}

export function sortInsights(rows: InsightRow[]): InsightRow[] {
  return [...rows].sort((a, b) => {
    const byTime = b.updated_at.localeCompare(a.updated_at);
    return byTime !== 0 ? byTime : a.title.localeCompare(b.title);
  });
}

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

export function findInsight(rows: InsightRow[], id: string | null): InsightRow | null {
  if (!id) return null;
  return rows.find((row) => row.id === id) ?? null;
}

export const EMPTY_INSIGHT_DETAIL = "No analysis yet for this insight.";

export function insightDetailBody(detail: string | null | undefined): {
  empty: boolean;
  text: string;
} {
  const text = (detail ?? "").trim();
  if (!text) return { empty: true, text: EMPTY_INSIGHT_DETAIL };
  return { empty: false, text };
}

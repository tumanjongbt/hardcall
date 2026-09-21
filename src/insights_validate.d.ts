import type { CreateInsight, InsightSource } from "./types";

export type ValidationDetail = {
  field: string;
  rule: string;
};

export const DETAIL_MAX: number;
export const INSIGHT_SOURCES: Set<InsightSource>;
export const PUBLIC_INSIGHT_SOURCES: Set<InsightSource>;
export const RESERVED_LIVE_SOURCES: Set<InsightSource>;

export function validateUpsertInsight(
  body: unknown
): { ok: true; value: CreateInsight } | { ok: false; details: ValidationDetail[] };

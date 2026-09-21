import type { CreateInsight } from "./types";

export type ValidationDetail = {
  field: string;
  rule: string;
};

export function validateUpsertInsight(
  body: unknown
): { ok: true; value: CreateInsight } | { ok: false; details: ValidationDetail[] };

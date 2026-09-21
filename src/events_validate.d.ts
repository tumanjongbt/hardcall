import type { CreateEvent } from "./types";

export const CHANNELS: Set<string>;
export const STAKEHOLDER_TAGS: Set<string>;

export type ValidationDetail = {
  field: string;
  rule: string;
};

export function validateCreateEvent(
  body: unknown
): { ok: true; value: CreateEvent } | { ok: false; details: ValidationDetail[] };

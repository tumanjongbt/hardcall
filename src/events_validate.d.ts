import type { CreateEvent, EventSource } from "./types";

export const CHANNELS: Set<string>;
export const STAKEHOLDER_TAGS: Set<string>;
export const EVENT_SOURCES: Set<EventSource>;
export const DEFAULT_EVENT_SOURCE: EventSource;

export type ValidationDetail = {
  field: string;
  rule: string;
};

export function validateCreateEvent(
  body: unknown
): { ok: true; value: CreateEvent } | { ok: false; details: ValidationDetail[] };

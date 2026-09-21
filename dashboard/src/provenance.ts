import type { StreamStatus } from "./types";

export const LIVE_EVENT_SOURCES = new Set(["bls", "onet"]);

export type BadgeKind = "live" | "demo";

export type SourceBadge = {
  label: string;
  kind: BadgeKind;
};

const EVENT_SOURCE_BADGES: Record<string, SourceBadge> = {
  synthetic: { label: "Demo", kind: "demo" },
  playground: { label: "Playground", kind: "demo" },
  cli: { label: "CLI", kind: "demo" },
  manual: { label: "Manual", kind: "demo" },
  bls: { label: "Live · BLS", kind: "live" },
  onet: { label: "Live · O*NET", kind: "live" },
  unknown: { label: "Unknown", kind: "demo" },
};

export function normalizeEventSource(value: unknown): string {
  return typeof value === "string" && value in EVENT_SOURCE_BADGES ? value : "unknown";
}

export function isLiveEventSource(value: unknown): boolean {
  return typeof value === "string" && LIVE_EVENT_SOURCES.has(value);
}

export function eventSourceBadge(value: unknown): SourceBadge {
  return EVENT_SOURCE_BADGES[normalizeEventSource(value)] ?? EVENT_SOURCE_BADGES.unknown;
}

export function insightSourceBadge(value: unknown): SourceBadge {
  if (value === "bls") return { label: "Live · BLS", kind: "live" };
  if (value === "onet") return { label: "Live · O*NET", kind: "live" };
  if (value === "manual") return { label: "Manual", kind: "demo" };
  if (value === "unknown") return { label: "Unknown", kind: "demo" };
  return { label: "Demo KPI", kind: "demo" };
}

export function provenanceCounts(
  events: Array<{ source?: string | null }>
): { live: number; demo: number } {
  let live = 0;
  let demo = 0;
  for (const event of events) {
    if (isLiveEventSource(event.source)) live += 1;
    else demo += 1;
  }
  return { live, demo };
}

export function pipeStatusLabel(status: StreamStatus): string {
  if (status === "live") return "Pipe live";
  if (status === "connecting") return "Connecting";
  return "Stream down";
}

export function pipeProvenanceNote(
  status: StreamStatus,
  live: number,
  demo: number
): string | null {
  if (status !== "live") return null;
  if (live === 0) return "SSE live · feed is mostly demo until adapters ship";
  return `${live} live · ${demo} demo`;
}

export function eventStampKind(fetchedAt: string | null | undefined): "fetched" | "posted" {
  return fetchedAt ? "fetched" : "posted";
}

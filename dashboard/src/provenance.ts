import type { StreamStatus } from "./types";

export const LIVE_EVENT_SOURCES = new Set([
  "bls",
  "onet",
  "scorecard",
  "apprenticeship_gov",
  "bls_ep",
  "ipeds",
  "careeronestop",
  "census",
  "bea",
  "fred",
]);

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
  scorecard: { label: "Live · Scorecard", kind: "live" },
  apprenticeship_gov: { label: "Live · Apprenticeship", kind: "live" },
  bls_ep: { label: "Live · BLS EP", kind: "live" },
  ipeds: { label: "Live · IPEDS", kind: "live" },
  careeronestop: { label: "Live · CareerOneStop", kind: "live" },
  census: { label: "Live · Census", kind: "live" },
  bea: { label: "Live · BEA", kind: "live" },
  fred: { label: "Live · FRED", kind: "live" },
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
  if (typeof value === "string" && isLiveEventSource(value)) {
    return EVENT_SOURCE_BADGES[value] ?? { label: "Demo KPI", kind: "demo" };
  }
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
  if (live === 0 && demo === 0) return "SSE live · waiting for ingest";
  if (live === 0) return "SSE live · no live-source rows in this feed";
  if (demo === 0) return `${live} live`;
  return `${live} live · ${demo} demo`;
}

export function eventStampKind(fetchedAt: string | null | undefined): "fetched" | "posted" {
  return fetchedAt ? "fetched" : "posted";
}

export const ATTRIBUTION =
  "Data: U.S. Department of Education College Scorecard (institution / program cost of attendance, not per-course sticker) · U.S. Bureau of Labor Statistics OEWS · O*NET Database by USDOL/ETA (CC BY 4.0; O*NET® is a trademark of USDOL/ETA) · U.S. Department of Labor registered apprenticeship partner sponsors. Live badges are server-side adapters only. CareerOneStop (DOLETA + DEED) attribution is required if those rows appear; Bing geocodes must never be stored.";

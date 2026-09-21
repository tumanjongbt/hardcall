import type { Channel, StakeholderTag } from "./channels";

export type SeedFile = {
  events: Record<string, unknown>[];
  insights: Record<string, unknown>[];
};

export type SeedProgress = {
  running: boolean;
  fileName: string | null;
  total: number;
  done: number;
  current: string | null;
  eventsOk: number;
  insightsOk: number;
  errors: string[];
  success: string | null;
  parseError: string | null;
};

const SEED_CHANNEL_MAP: Record<string, Channel> = {
  "growing jobs": "trade",
  "ai impact alerts": "automation",
  "pay updates": "community_college",
  "pathway comparison": "apprenticeship",
  "skills needed": "community_college",
  university: "university",
  "community college": "community_college",
  trade: "trade",
  apprenticeship: "apprenticeship",
  automation: "automation",
};

const SEED_TAG_MAP: Record<string, StakeholderTag> = {
  "high school students": "high_school_students",
  "college students": "college_students",
  parents: "parents",
  "career counselors": "career_counselors",
  "workforce training managers": "workforce_training_managers",
};

export function emptySeedProgress(): SeedProgress {
  return {
    running: false,
    fileName: null,
    total: 0,
    done: 0,
    current: null,
    eventsOk: 0,
    insightsOk: 0,
    errors: [],
    success: null,
    parseError: null,
  };
}

export function isJsonFile(file: { name: string; type?: string }): boolean {
  const name = file.name.trim().toLowerCase();
  if (!name.endsWith(".json")) return false;
  const type = (file.type ?? "").trim().toLowerCase();
  return type === "" || type === "application/json" || type === "text/json";
}

export function parseSeedJson(text: string): { ok: true; value: SeedFile } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Expected an object with optional "events" and "insights" arrays.',
    };
  }
  const rec = parsed as { events?: unknown; insights?: unknown };
  if (rec.events !== undefined && !Array.isArray(rec.events)) {
    return { ok: false, error: '"events" must be an array when present.' };
  }
  if (rec.insights !== undefined && !Array.isArray(rec.insights)) {
    return { ok: false, error: '"insights" must be an array when present.' };
  }
  const events = Array.isArray(rec.events) ? rec.events.filter(isRecord) : [];
  const insights = Array.isArray(rec.insights) ? rec.insights.filter(isRecord) : [];
  if (events.length === 0 && insights.length === 0) {
    return { ok: false, error: "JSON has no events or insights to ingest." };
  }
  return { ok: true, value: { events, insights } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function itemTitle(raw: Record<string, unknown>, fallback: string): string {
  return typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : fallback;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function mapSeedChannel(raw: unknown): Channel | undefined {
  if (typeof raw !== "string") return undefined;
  return SEED_CHANNEL_MAP[normalizeKey(raw)];
}

export function mapSeedTags(raw: unknown): StakeholderTag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<StakeholderTag>();
  const tags: StakeholderTag[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const mapped = SEED_TAG_MAP[normalizeKey(item)];
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    tags.push(mapped);
  }
  return tags;
}

function seedIcon(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.icon === "string" && raw.icon.trim()) return raw.icon.trim();
  if (typeof raw.emoji === "string" && raw.emoji.trim()) return raw.emoji.trim();
  return undefined;
}

/** Convert seed event JSON to POST /api/events body. Maps Bernard’s sample fields. */
export function eventToPostPayload(
  raw: Record<string, unknown>,
  now = Date.now()
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    source: "synthetic",
    tags: mapSeedTags(raw.tags),
  };
  const channel = mapSeedChannel(raw.channel);
  if (channel) payload.channel = channel;
  else if (raw.channel !== undefined) payload.channel = raw.channel;
  if (raw.title !== undefined) payload.title = raw.title;
  if (raw.description !== undefined) payload.description = raw.description;
  const icon = seedIcon(raw);
  if (icon) payload.emoji = icon;

  if (typeof raw.minutes_ago === "number" && Number.isFinite(raw.minutes_ago)) {
    payload.created_at = new Date(now - raw.minutes_ago * 60 * 1000).toISOString();
  } else if (typeof raw.created_at === "string" && raw.created_at.trim()) {
    payload.created_at = raw.created_at.trim();
  }
  return payload;
}

/** Convert seed insight JSON to POST /api/insight body. */
export function insightToPostPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = { source: "synthetic" };
  if (raw.title !== undefined) payload.title = raw.title;
  if (raw.value !== undefined) payload.value = raw.value;
  const icon = seedIcon(raw);
  payload.detail = icon ? `Icon: ${icon}` : "";
  return payload;
}

export function successMessage(eventsOk: number, insightsOk: number): string {
  const trends = `Successfully ingested ${eventsOk} career trend${eventsOk === 1 ? "" : "s"}`;
  if (insightsOk === 0) return trends;
  return `${trends} · ${insightsOk} insight${insightsOk === 1 ? "" : "s"}`;
}

export async function ingestSeed(
  seed: SeedFile,
  deps: {
    postEvent: (payload: unknown) => Promise<unknown>;
    postInsight: (payload: unknown) => Promise<unknown>;
    onProgress: (patch: Partial<SeedProgress>) => void;
    now?: number;
  }
): Promise<{ eventsOk: number; insightsOk: number; errors: string[] }> {
  const now = deps.now ?? Date.now();
  const total = seed.events.length + seed.insights.length;
  let done = 0;
  let eventsOk = 0;
  let insightsOk = 0;
  const errors: string[] = [];

  deps.onProgress({
    running: true,
    total,
    done: 0,
    eventsOk: 0,
    insightsOk: 0,
    errors: [],
    success: null,
    parseError: null,
  });

  for (let i = 0; i < seed.events.length; i += 1) {
    const raw = seed.events[i] ?? {};
    const label = itemTitle(raw, `event ${i + 1}`);
    deps.onProgress({
      current: `Event ${i + 1}/${seed.events.length}: ${label}`,
      done,
    });
    try {
      await deps.postEvent(eventToPostPayload(raw, now));
      eventsOk += 1;
    } catch (err) {
      errors.push(`Event ${i + 1} “${label}”: ${errorText(err)}`);
    }
    done += 1;
    deps.onProgress({ done, eventsOk, errors: [...errors] });
  }

  for (let i = 0; i < seed.insights.length; i += 1) {
    const raw = seed.insights[i] ?? {};
    const label = itemTitle(raw, `insight ${i + 1}`);
    deps.onProgress({
      current: `Insight ${i + 1}/${seed.insights.length}: ${label}`,
      done,
    });
    try {
      await deps.postInsight(insightToPostPayload(raw));
      insightsOk += 1;
    } catch (err) {
      errors.push(`Insight ${i + 1} “${label}”: ${errorText(err)}`);
    }
    done += 1;
    deps.onProgress({ done, insightsOk, errors: [...errors] });
  }

  const success = errors.length === 0 ? successMessage(eventsOk, insightsOk) : null;
  deps.onProgress({
    running: false,
    current: null,
    done: total,
    eventsOk,
    insightsOk,
    errors: [...errors],
    success,
  });
  return { eventsOk, insightsOk, errors };
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Request failed.";
}

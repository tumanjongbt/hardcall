/** POST /api/insight — boundary validation. Trust DB constraints after parse. */

const ALLOWED_KEYS = new Set([
  "title",
  "value",
  "detail",
  "source",
  "source_url",
  "fetched_at",
]);
const DETAIL_MAX = 8000;

/** Stored / GET enum. Live reserved values are adapter-only. */
const INSIGHT_SOURCES = new Set([
  "synthetic",
  "manual",
  "bls",
  "onet",
  "scorecard",
  "apprenticeship_gov",
  "bls_ep",
  "unknown",
]);

/** Writable on anonymous POST /api/insight (no playground/cli). */
const PUBLIC_INSIGHT_SOURCES = new Set(["synthetic", "manual", "unknown"]);

const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function parseSourceUrl(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, rule: "http_url" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > 2000) return { ok: false, rule: "length_1_2000" };
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, rule: "http_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, rule: "http_url" };
  }
  return { ok: true, value: trimmed };
}

function parseFetchedAt(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, rule: "iso_datetime" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (!ISO_DATETIME.test(trimmed)) return { ok: false, rule: "iso_datetime" };
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return { ok: false, rule: "iso_datetime" };
  return { ok: true, value: date.toISOString() };
}

const RESERVED_LIVE_SOURCES = new Set([
  "bls",
  "onet",
  "scorecard",
  "apprenticeship_gov",
  "bls_ep",
]);

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: { title: string, value: string, detail?: string, source?: string } } | { ok: false, details: { field: string, rule: string }[] }}
 */
function validateUpsertInsight(body) {
  const details = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, details: [{ field: "_", rule: "object_required" }] };
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      details.push({ field: key, rule: "unknown_key" });
    }
  }

  let title = body.title;
  if (title === undefined || title === null) {
    details.push({ field: "title", rule: "required" });
  } else if (typeof title !== "string") {
    details.push({ field: "title", rule: "string" });
  } else {
    title = title.trim();
    if (title.length < 1 || title.length > 200) {
      details.push({ field: "title", rule: "length_1_200" });
    }
  }

  let value = body.value;
  if (value === undefined || value === null) {
    details.push({ field: "value", rule: "required" });
  } else if (typeof value !== "string") {
    details.push({ field: "value", rule: "string" });
  } else {
    value = value.trim();
    if (value.length < 1 || value.length > 500) {
      details.push({ field: "value", rule: "length_1_500" });
    }
  }

  const detailProvided = Object.prototype.hasOwnProperty.call(body, "detail");
  let detail;
  if (detailProvided) {
    const raw = body.detail;
    if (raw === undefined || raw === null) {
      details.push({ field: "detail", rule: "string" });
    } else if (typeof raw !== "string") {
      details.push({ field: "detail", rule: "string" });
    } else {
      detail = raw.trim();
      if (detail.length > DETAIL_MAX) {
        details.push({ field: "detail", rule: "length_0_8000" });
      }
    }
  }

  const sourceProvided = Object.prototype.hasOwnProperty.call(body, "source");
  let source;
  if (sourceProvided) {
    const raw = body.source;
    if (typeof raw !== "string") {
      details.push({ field: "source", rule: "enum" });
    } else if (RESERVED_LIVE_SOURCES.has(raw)) {
      details.push({ field: "source", rule: "reserved" });
    } else if (!PUBLIC_INSIGHT_SOURCES.has(raw)) {
      details.push({ field: "source", rule: "enum" });
    } else {
      source = raw;
    }
  }

  const sourceUrlProvided = Object.prototype.hasOwnProperty.call(body, "source_url");
  const sourceUrl = parseSourceUrl(body.source_url);
  if (!sourceUrl.ok) details.push({ field: "source_url", rule: sourceUrl.rule });

  const fetchedAtProvided = Object.prototype.hasOwnProperty.call(body, "fetched_at");
  const fetchedAt = parseFetchedAt(body.fetched_at);
  if (!fetchedAt.ok) details.push({ field: "fetched_at", rule: fetchedAt.rule });

  if (details.length) return { ok: false, details };

  /** @type {{ title: string, value: string, detail?: string, source?: string, source_url?: string | null, fetched_at?: string | null }} */
  const parsed = { title, value };
  if (detailProvided) parsed.detail = detail;
  if (sourceProvided) parsed.source = source;
  if (sourceUrlProvided) parsed.source_url = sourceUrl.value;
  if (fetchedAtProvided) parsed.fetched_at = fetchedAt.value;

  return { ok: true, value: parsed };
}

module.exports = {
  DETAIL_MAX,
  INSIGHT_SOURCES,
  PUBLIC_INSIGHT_SOURCES,
  RESERVED_LIVE_SOURCES,
  validateUpsertInsight,
};

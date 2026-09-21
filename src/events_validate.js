/** POST /api/events — boundary validation. Trust DB constraints after parse. */

const CHANNELS = new Set([
  "university",
  "community_college",
  "trade",
  "apprenticeship",
  "automation",
]);

const STAKEHOLDER_TAGS = new Set([
  "high_school_students",
  "college_students",
  "parents",
  "career_counselors",
  "workforce_training_managers",
]);

/** Documented event provenance. Default on omit: `manual` (anonymous POST). */
const EVENT_SOURCES = new Set([
  "synthetic",
  "manual",
  "playground",
  "cli",
  "bls",
  "onet",
  "unknown",
]);

const DEFAULT_EVENT_SOURCE = "manual";

const ALLOWED_KEYS = new Set([
  "channel",
  "title",
  "description",
  "emoji",
  "tags",
  "source",
  "source_url",
  "fetched_at",
]);

const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, rule: string }}
 */
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

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, rule: string }}
 */
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

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: object } | { ok: false, details: { field: string, rule: string }[] }}
 */
function validateCreateEvent(body) {
  const details = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, details: [{ field: "_", rule: "object_required" }] };
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      details.push({ field: key, rule: "unknown_key" });
    }
  }

  const channel = body.channel;
  if (channel === undefined || channel === null) {
    details.push({ field: "channel", rule: "required" });
  } else if (typeof channel !== "string" || !CHANNELS.has(channel)) {
    details.push({ field: "channel", rule: "enum" });
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

  let description = body.description;
  if (description === undefined) {
    description = null;
  } else if (description === null) {
    // ok
  } else if (typeof description !== "string") {
    details.push({ field: "description", rule: "string_or_null" });
  } else {
    description = description.trim();
    if (description.length === 0) description = null;
    else if (description.length > 4000) {
      details.push({ field: "description", rule: "length_1_4000" });
    }
  }

  let emoji = body.emoji;
  if (emoji === undefined) {
    emoji = null;
  } else if (emoji === null) {
    // ok
  } else if (typeof emoji !== "string") {
    details.push({ field: "emoji", rule: "string_or_null" });
  } else {
    emoji = emoji.trim();
    if (emoji.length === 0) emoji = null;
    else if (emoji.length > 16) {
      details.push({ field: "emoji", rule: "length_1_16" });
    }
  }

  let tags = body.tags;
  if (tags === undefined) {
    tags = [];
  } else if (!Array.isArray(tags)) {
    details.push({ field: "tags", rule: "array" });
  } else {
    const seen = new Set();
    for (const t of tags) {
      if (typeof t !== "string" || !STAKEHOLDER_TAGS.has(t)) {
        details.push({ field: "tags", rule: "enum" });
        break;
      }
      if (seen.has(t)) {
        details.push({ field: "tags", rule: "unique" });
        break;
      }
      seen.add(t);
    }
  }

  let source = DEFAULT_EVENT_SOURCE;
  if (body.source !== undefined && body.source !== null) {
    if (typeof body.source !== "string" || !EVENT_SOURCES.has(body.source)) {
      details.push({ field: "source", rule: "enum" });
    } else {
      source = body.source;
    }
  }

  const sourceUrl = parseSourceUrl(body.source_url);
  if (!sourceUrl.ok) details.push({ field: "source_url", rule: sourceUrl.rule });

  const fetchedAt = parseFetchedAt(body.fetched_at);
  if (!fetchedAt.ok) details.push({ field: "fetched_at", rule: fetchedAt.rule });

  if (details.length) return { ok: false, details };

  return {
    ok: true,
    value: {
      channel,
      title,
      description,
      emoji,
      tags,
      source,
      source_url: sourceUrl.value,
      fetched_at: fetchedAt.value,
    },
  };
}

module.exports = {
  CHANNELS,
  DEFAULT_EVENT_SOURCE,
  EVENT_SOURCES,
  STAKEHOLDER_TAGS,
  validateCreateEvent,
};

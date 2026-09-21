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

const ALLOWED_KEYS = new Set([
  "channel",
  "title",
  "description",
  "emoji",
  "tags",
]);

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

  if (details.length) return { ok: false, details };

  return {
    ok: true,
    value: {
      channel,
      title,
      description,
      emoji,
      tags,
    },
  };
}

module.exports = {
  CHANNELS,
  STAKEHOLDER_TAGS,
  validateCreateEvent,
};

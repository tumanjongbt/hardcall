/** POST /api/insight — boundary validation. Trust DB constraints after parse. */

const ALLOWED_KEYS = new Set(["title", "value"]);

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: { title: string, value: string } } | { ok: false, details: { field: string, rule: string }[] }}
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

  if (details.length) return { ok: false, details };

  return {
    ok: true,
    value: {
      title,
      value,
    },
  };
}

module.exports = {
  validateUpsertInsight,
};

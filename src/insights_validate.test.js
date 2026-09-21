const { validateUpsertInsight } = require("./insights_validate");
const assert = require("node:assert/strict");

function ok(body) {
  const r = validateUpsertInsight(body);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
}

function fail(body, field, rule) {
  const r = validateUpsertInsight(body);
  assert.equal(r.ok, false);
  assert.ok(
    r.details.some((d) => d.field === field && d.rule === rule),
    JSON.stringify(r.details)
  );
}

const trimmed = ok({
  title: "  Top Trade Income Growth  ",
  value: "  +18%  ",
});
assert.equal(trimmed.title, "Top Trade Income Growth");
assert.equal(trimmed.value, "+18%");

fail({ value: "+18%" }, "title", "required");
fail({ title: "ROI" }, "value", "required");
fail({ title: "", value: "+18%" }, "title", "length_1_200");
fail({ title: "ROI", value: "" }, "value", "length_1_500");
fail({ title: "ROI", value: "+18%", extra: 1 }, "extra", "unknown_key");
fail({ title: 12, value: "+18%" }, "title", "string");
fail(null, "_", "object_required");

console.log("insights_validate: ok");

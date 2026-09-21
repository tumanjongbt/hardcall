const { validateCreateEvent } = require("./events_validate");
const assert = require("node:assert/strict");

function ok(body) {
  const r = validateCreateEvent(body);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
}

function fail(body, field, rule) {
  const r = validateCreateEvent(body);
  assert.equal(r.ok, false);
  assert.ok(
    r.details.some((d) => d.field === field && d.rule === rule),
    JSON.stringify(r.details)
  );
}

ok({
  channel: "trade",
  title: "  HVAC demand  ",
  tags: ["high_school_students"],
});
assert.equal(
  ok({ channel: "automation", title: "AI shift", description: "  ", emoji: "" })
    .description,
  null
);
fail({ title: "x" }, "channel", "required");
fail({ channel: "university", title: "" }, "title", "length_1_200");
fail({ channel: "nope", title: "x" }, "channel", "enum");
fail(
  { channel: "university", title: "x", tags: ["parents", "parents"] },
  "tags",
  "unique"
);
fail({ channel: "university", title: "x", extra: 1 }, "extra", "unknown_key");

console.log("events_validate: ok");

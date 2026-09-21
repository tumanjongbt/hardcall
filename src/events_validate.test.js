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

const omitted = ok({
  channel: "trade",
  title: "  HVAC demand  ",
  tags: ["high_school_students"],
});
assert.equal(omitted.source, "manual");
assert.equal(omitted.source_url, null);
assert.equal(omitted.fetched_at, null);
assert.equal(
  ok({ channel: "automation", title: "AI shift", description: "  ", emoji: "" })
    .description,
  null
);
assert.equal(
  ok({ channel: "trade", title: "x", source: "playground" }).source,
  "playground"
);
assert.equal(ok({ channel: "trade", title: "x", source: "cli" }).source, "cli");
assert.equal(
  ok({
    channel: "trade",
    title: "x",
    source: "playground",
    source_url: " https://www.bls.gov/ooh/ ",
    fetched_at: "2026-09-21T12:00:00.000Z",
  }).source_url,
  "https://www.bls.gov/ooh/"
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
fail({ channel: "university", title: "x", source: "scraper" }, "source", "enum");
fail({ channel: "university", title: "x", source: "bls" }, "source", "reserved");
fail({ channel: "university", title: "x", source: "onet" }, "source", "reserved");
fail(
  { channel: "university", title: "x", source_url: "ftp://example.com" },
  "source_url",
  "http_url"
);
fail(
  { channel: "university", title: "x", fetched_at: "next Tuesday" },
  "fetched_at",
  "iso_datetime"
);

console.log("events_validate: ok");

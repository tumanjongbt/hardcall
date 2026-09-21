import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventToPostPayload,
  ingestSeed,
  insightToPostPayload,
  isJsonFile,
  parseSeedJson,
  successMessage,
} from "./seed";

test("isJsonFile accepts .json names only", () => {
  assert.equal(isJsonFile({ name: "seed.json" }), true);
  assert.equal(isJsonFile({ name: "SEED.JSON", type: "application/json" }), true);
  assert.equal(isJsonFile({ name: "notes.txt" }), false);
  assert.equal(isJsonFile({ name: "seed.json.txt" }), false);
});

test("parseSeedJson reads events and insights arrays", () => {
  const parsed = parseSeedJson(
    JSON.stringify({
      events: [{ channel: "trade", title: "HVAC" }],
      insights: [{ title: "ROI", value: "+6%" }],
    })
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.events.length, 1);
  assert.equal(parsed.value.insights.length, 1);
});

test("parseSeedJson treats missing arrays as empty and rejects junk", () => {
  assert.equal(parseSeedJson("{").ok, false);
  assert.equal(parseSeedJson("[]").ok, false);
  assert.equal(parseSeedJson("{}").ok, false);
  const onlyEvents = parseSeedJson(JSON.stringify({ events: [{ title: "x" }] }));
  assert.equal(onlyEvents.ok, true);
  if (onlyEvents.ok) assert.deepEqual(onlyEvents.value.insights, []);
});

test("eventToPostPayload converts minutes_ago and defaults source", () => {
  const now = Date.parse("2026-09-21T12:00:00.000Z");
  const payload = eventToPostPayload(
    {
      channel: "trade",
      title: "Welding night cohort",
      description: "Seats gone.",
      emoji: "🔧",
      tags: ["high_school_students"],
      minutes_ago: 120,
    },
    now
  );
  assert.equal(payload.created_at, "2026-09-21T10:00:00.000Z");
  assert.equal("minutes_ago" in payload, false);
  assert.equal(payload.source, "synthetic");
  assert.equal(payload.channel, "trade");
});

test("eventToPostPayload keeps fetched_at and explicit source", () => {
  const payload = eventToPostPayload({
    channel: "trade",
    title: "x",
    source: "manual",
    fetched_at: "2026-09-21T08:00:00.000Z",
    minutes_ago: 0,
  });
  assert.equal(payload.source, "manual");
  assert.equal(payload.fetched_at, "2026-09-21T08:00:00.000Z");
  assert.ok(typeof payload.created_at === "string");
});

test("insightToPostPayload defaults source to synthetic", () => {
  assert.deepEqual(insightToPostPayload({ title: "ROI", value: "+6%", detail: "n" }), {
    title: "ROI",
    value: "+6%",
    detail: "n",
    source: "synthetic",
  });
});

test("successMessage names career trends and insights", () => {
  assert.equal(successMessage(3, 0), "Successfully ingested 3 career trends");
  assert.equal(successMessage(1, 2), "Successfully ingested 1 career trend · 2 insights");
});

test("ingestSeed posts events then insights and reports errors", async () => {
  const posted: string[] = [];
  const result = await ingestSeed(
    {
      events: [
        { channel: "trade", title: "A", minutes_ago: 10 },
        { channel: "trade", title: "B" },
      ],
      insights: [{ title: "KPI", value: "1" }],
    },
    {
      now: Date.parse("2026-09-21T12:00:00.000Z"),
      async postEvent(payload) {
        const rec = payload as { title?: string };
        posted.push(`event:${rec.title}`);
        if (rec.title === "B") throw new Error("HTTP 400: title: nope");
      },
      async postInsight(payload) {
        const rec = payload as { title?: string };
        posted.push(`insight:${rec.title}`);
      },
      onProgress() {},
    }
  );
  assert.deepEqual(posted, ["event:A", "event:B", "insight:KPI"]);
  assert.equal(result.eventsOk, 1);
  assert.equal(result.insightsOk, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0] ?? "", /Event 2/);
});

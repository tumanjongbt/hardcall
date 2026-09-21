import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventToPostPayload,
  ingestSeed,
  insightToPostPayload,
  isJsonFile,
  mapSeedChannel,
  mapSeedTags,
  parseSeedJson,
  successMessage,
} from "./seed";

test("isJsonFile accepts .json names only", () => {
  assert.equal(isJsonFile({ name: "seed.json" }), true);
  assert.equal(isJsonFile({ name: "SEED.JSON", type: "application/json" }), true);
  assert.equal(isJsonFile({ name: "notes.txt" }), false);
  assert.equal(isJsonFile({ name: "seed.json.txt" }), false);
});

test("parseSeedJson ignores project and reads events and insights", () => {
  const parsed = parseSeedJson(
    JSON.stringify({
      project: { name: "Hardcall" },
      events: [{ channel: "growing-jobs", title: "HVAC" }],
      insights: [{ title: "ROI", value: "+6%", icon: "📈" }],
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

test("mapSeedChannel uses the fixed seed-channel map", () => {
  assert.equal(mapSeedChannel("growing-jobs"), "trade");
  assert.equal(mapSeedChannel("ai-impact-alerts"), "automation");
  assert.equal(mapSeedChannel("pay-updates"), "community_college");
  assert.equal(mapSeedChannel("pathway-comparison"), "apprenticeship");
  assert.equal(mapSeedChannel("skills-needed"), "community_college");
  assert.equal(mapSeedChannel("Growing Jobs"), "trade");
  assert.equal(mapSeedChannel("trade"), "trade");
  assert.equal(mapSeedChannel("nope"), undefined);
});

test("mapSeedTags maps display labels and skips path labels", () => {
  assert.deepEqual(
    mapSeedTags([
      "High School Students",
      "College Students",
      "Parents",
      "Career Counselors",
      "Workforce Training Managers",
      "Apprenticeships",
      "Community College",
      "high_school_students",
    ]),
    [
      "high_school_students",
      "college_students",
      "parents",
      "career_counselors",
      "workforce_training_managers",
    ]
  );
});

test("eventToPostPayload maps Bernard seed fields to the API body", () => {
  const now = Date.parse("2026-09-21T12:00:00.000Z");
  const payload = eventToPostPayload(
    {
      channel: "growing-jobs",
      title: "Electrician overtime is spiking",
      description: "Night call-outs in the valley.",
      icon: "🔧",
      tags: ["High School Students", "Apprenticeships"],
      minutes_ago: 120,
    },
    now
  );
  assert.deepEqual(payload, {
    channel: "trade",
    title: "Electrician overtime is spiking",
    description: "Night call-outs in the valley.",
    emoji: "🔧",
    tags: ["high_school_students"],
    source: "synthetic",
    created_at: "2026-09-21T10:00:00.000Z",
  });
  assert.equal("minutes_ago" in payload, false);
  assert.equal("icon" in payload, false);
});

test("eventToPostPayload always sends synthetic and never live sources", () => {
  const payload = eventToPostPayload({
    channel: "ai-impact-alerts",
    title: "Claims coding is automating",
    source: "bls",
    minutes_ago: 0,
  });
  assert.equal(payload.source, "synthetic");
  assert.equal(payload.channel, "automation");
});

test("insightToPostPayload puts icon in detail and forces synthetic", () => {
  assert.deepEqual(
    insightToPostPayload({
      title: "Top Trade Income Growth",
      value: "+18%",
      icon: "📈",
      source: "onet",
    }),
    {
      title: "Top Trade Income Growth",
      value: "+18%",
      detail: "Icon: 📈",
      source: "synthetic",
    }
  );
  assert.deepEqual(insightToPostPayload({ title: "ROI", value: "+6%" }), {
    title: "ROI",
    value: "+6%",
    detail: "",
    source: "synthetic",
  });
});

test("successMessage names career trends and insights", () => {
  assert.equal(successMessage(3, 0), "Successfully ingested 3 career trends");
  assert.equal(successMessage(1, 2), "Successfully ingested 1 career trend · 2 insights");
});

test("ingestSeed posts mapped events then insights", async () => {
  const posted: unknown[] = [];
  const result = await ingestSeed(
    {
      events: [
        {
          channel: "growing-jobs",
          title: "A",
          icon: "🔧",
          tags: ["High School Students"],
          minutes_ago: 10,
        },
        { channel: "skills-needed", title: "B" },
      ],
      insights: [{ title: "KPI", value: "1", icon: "⭐" }],
    },
    {
      now: Date.parse("2026-09-21T12:00:00.000Z"),
      async postEvent(payload) {
        posted.push(payload);
        const rec = payload as { title?: string };
        if (rec.title === "B") throw new Error("HTTP 400: title: nope");
      },
      async postInsight(payload) {
        posted.push(payload);
      },
      onProgress() {},
    }
  );
  assert.equal((posted[0] as { channel: string }).channel, "trade");
  assert.equal((posted[0] as { source: string }).source, "synthetic");
  assert.equal((posted[1] as { channel: string }).channel, "community_college");
  assert.deepEqual(posted[2], {
    title: "KPI",
    value: "1",
    detail: "Icon: ⭐",
    source: "synthetic",
  });
  assert.equal(result.eventsOk, 1);
  assert.equal(result.insightsOk, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0] ?? "", /Event 2/);
});

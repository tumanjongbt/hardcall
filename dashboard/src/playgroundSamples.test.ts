import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { CHANNELS } from "./channels";
import { buildEventPayload, defaultPlaygroundForm, fetchSnippet } from "./playground";
import {
  PLAYGROUND_SAMPLES,
  applySample,
  applySampleAt,
  cycleSample,
  nextSampleIndex,
  resetPlaygroundForm,
  sampleChannels,
  sampleCount,
  sampleStatusLabel,
} from "./playgroundSamples";

const require = createRequire(import.meta.url);
const { validateCreateEvent } = require("../../src/events_validate.js") as {
  validateCreateEvent: (
    body: unknown
  ) => { ok: true; value: unknown } | { ok: false; details: unknown[] };
};

test("catalog has at least five named samples across every channel", () => {
  assert.ok(sampleCount() >= 5);
  const names = PLAYGROUND_SAMPLES.map((sample) => sample.name);
  assert.ok(names.includes("Trade overtime"));
  assert.ok(names.includes("University tuition"));
  assert.ok(names.includes("Apprenticeship seats"));
  assert.ok(names.includes("Community college cert"));
  assert.ok(names.includes("Automation risk"));
  const channels = new Set(sampleChannels());
  for (const channel of CHANNELS) {
    assert.ok(channels.has(channel), `missing sample for ${channel}`);
  }
});

test("each sample payload is valid for POST /api/events", () => {
  for (const sample of PLAYGROUND_SAMPLES) {
    const payload = buildEventPayload(applySample(sample));
    const result = validateCreateEvent(payload);
    assert.equal(result.ok, true, `${sample.id} failed validation: ${JSON.stringify(result)}`);
    assert.ok(!("source" in payload));
    assert.ok(!("external_id" in payload));
    const snippet = fetchSnippet("https://hardcall-api.onrender.com", payload);
    assert.equal(snippet.includes("Authorization"), false);
    assert.equal(snippet.toLowerCase().includes("apikey"), false);
    assert.equal(snippet.includes("Bearer"), false);
  }
});

test("applySample clones form fields so catalog stays frozen", () => {
  const original = PLAYGROUND_SAMPLES[0];
  assert.ok(original);
  const form = applySample(original);
  assert.deepEqual(form, original.form);
  form.title = "mutated";
  form.tags.push("parents");
  assert.equal(original.form.title, "Electrician overtime wages rise 14% in Q3");
  assert.deepEqual(original.form.tags, [
    "high_school_students",
    "workforce_training_managers",
  ]);
  assert.deepEqual(applySampleAt(0), original.form);
  assert.equal(applySampleAt(-1), null);
  assert.equal(applySampleAt(99), null);
});

test("cycleSample starts at 0 then wraps after the last example", () => {
  const first = cycleSample(null);
  assert.equal(first.index, 0);
  assert.equal(first.sample.id, "trade-overtime");
  assert.equal(first.form.channel, "trade");
  assert.equal(first.form.title, PLAYGROUND_SAMPLES[0]?.form.title);

  const second = cycleSample(first.index);
  assert.equal(second.index, 1);
  assert.equal(second.sample.name, "University tuition");
  assert.equal(second.form.channel, "university");

  const lastIndex = PLAYGROUND_SAMPLES.length - 1;
  const wrapped = cycleSample(lastIndex);
  assert.equal(wrapped.index, 0);
  assert.equal(wrapped.sample.id, "trade-overtime");

  assert.equal(nextSampleIndex(null), 0);
  assert.equal(nextSampleIndex(0), 1);
  assert.equal(nextSampleIndex(lastIndex), 0);
  assert.equal(nextSampleIndex(-3), 0);
  assert.equal(nextSampleIndex(50), 0);
});

test("resetPlaygroundForm returns empty defaults and clears sample status", () => {
  const filled = cycleSample(null).form;
  assert.ok(filled.title.length > 0);
  assert.deepEqual(resetPlaygroundForm(), defaultPlaygroundForm());
  assert.deepEqual(resetPlaygroundForm(), {
    channel: "university",
    title: "",
    description: "",
    emoji: "",
    tags: [],
  });
  assert.equal(sampleStatusLabel(null), null);
  assert.equal(sampleStatusLabel(0), "Sample 1/5: Trade overtime");
  assert.equal(sampleStatusLabel(1), "Sample 2/5: University tuition");
  assert.equal(sampleStatusLabel(4), "Sample 5/5: Automation risk");
  assert.equal(sampleStatusLabel(9), null);
});

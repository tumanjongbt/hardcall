import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTIONS,
  CHANNEL_SO_WHAT,
  DECISION_LINE,
  EMPTY_COMPARE,
  EVENTS_SOURCE,
  FORECAST_CHIP,
  FORECAST_NOTE,
  NON_ADVISORY,
  PROJECTED_INTENSITY_LABEL,
  compareCaption,
  forecastSeriesLabel,
  historySeriesLabel,
  splitCaption,
  spikeCaption,
  vintageStrip,
} from "./copy";

test("decision line is a single scannable question", () => {
  assert.match(DECISION_LINE, /labor-market signal/);
  assert.match(DECISION_LINE, /automation/);
  assert.equal(DECISION_LINE.includes("\n"), false);
});

test("forecast note does not repeat the Not-advice chip label", () => {
  assert.equal(FORECAST_NOTE.startsWith("Not advice"), false);
  assert.match(NON_ADVISORY, /^Not advice\./);
  assert.match(FORECAST_NOTE, /naive/i);
  assert.match(FORECAST_NOTE, /not a wage or ROI guarantee/i);
});

test("forecast chip and series labels carry non-advisory / not a wage or ROI guarantee", () => {
  assert.equal(FORECAST_CHIP, "Non-advisory · not a wage or ROI guarantee");
  assert.match(NON_ADVISORY, /GET \/api\/events/);
  assert.equal(
    PROJECTED_INTENSITY_LABEL,
    "Projected signal intensity (not a wage or ROI guarantee)"
  );
  assert.equal(EVENTS_SOURCE, "GET /api/events");
  assert.equal(
    historySeriesLabel(90, "2026-09-21"),
    "History · last 90d · as of 2026-09-21 · GET /api/events"
  );
  assert.equal(
    forecastSeriesLabel(14, "2026-09-21"),
    "Naive forecast · next 14d · as of 2026-09-21 · GET /api/events"
  );
  assert.equal(
    vintageStrip(90, 14, "2026-09-21"),
    "Hist last 90d · forecast next 14d · as of 2026-09-21 · GET /api/events"
  );
});

test("forecast-adjacent copy does not claim earnings, certainty, or counselor recs", () => {
  const blobs = [
    FORECAST_CHIP,
    NON_ADVISORY,
    FORECAST_NOTE,
    PROJECTED_INTENSITY_LABEL,
    ...Object.values(CHANNEL_SO_WHAT),
    splitCaption({ total: 10, automationPercent: 50, humanPercent: 50 }),
  ].join("\n");
  assert.doesNotMatch(blobs, /you will earn/i);
  assert.doesNotMatch(blobs, /earn-while-you-learn/i);
  assert.doesNotMatch(blobs, /steer(?:ing)? anyone/i);
  assert.doesNotMatch(blobs, /skip university/i);
});

test("compareCaption is honest when both paths have zero volume", () => {
  const empty = compareCaption({
    a: { channel: "trade" },
    b: { channel: "university" },
    totalA: 0,
    totalB: 0,
    leader: null,
  });
  assert.equal(empty, EMPTY_COMPARE);
  assert.equal(empty.includes("tie"), false);
  assert.equal(empty.includes("0–0"), false);
  assert.equal(empty.includes("0-0"), false);
});

test("compareCaption names the leader when there is volume", () => {
  assert.match(
    compareCaption({
      a: { channel: "trade" },
      b: { channel: "university" },
      totalA: 12,
      totalB: 4,
      leader: "trade",
    }),
    /Trade is ahead 12 to 4/
  );
  assert.match(
    compareCaption({
      a: { channel: "trade" },
      b: { channel: "university" },
      totalA: 3,
      totalB: 3,
      leader: null,
    }),
    /same signal \(3 events each\)/
  );
});

test("primary captions stay short", () => {
  assert.ok(CAPTIONS.activity.length < 80);
  assert.ok(CAPTIONS.compare.length < 90);
  assert.equal(spikeCaption([]), "");
  assert.equal(spikeCaption([{ label: "Sep 21", count: 508 }]), "Spike days: Sep 21 (508).");
});

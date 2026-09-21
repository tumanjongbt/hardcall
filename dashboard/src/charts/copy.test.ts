import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTIONS,
  DECISION_LINE,
  EMPTY_COMPARE,
  FORECAST_NOTE,
  NON_ADVISORY,
  STORE_FOOTNOTE,
  compareCaption,
  spikeCaption,
} from "./copy";

test("store footnote does not claim live market data", () => {
  assert.match(STORE_FOOTNOTE, /event store/);
  assert.match(STORE_FOOTNOTE, /Live badges/);
  assert.equal(STORE_FOOTNOTE.toLowerCase().includes("live market data"), false);
});

test("decision line is a single scannable question", () => {
  assert.match(DECISION_LINE, /labor-market signal/);
  assert.match(DECISION_LINE, /automation/);
  assert.equal(DECISION_LINE.includes("\n"), false);
});

test("forecast note does not repeat the Not-advice chip label", () => {
  assert.equal(FORECAST_NOTE.startsWith("Not advice"), false);
  assert.match(NON_ADVISORY, /^Not advice\./);
  assert.match(FORECAST_NOTE, /telemetry projection/);
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

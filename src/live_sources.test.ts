import assert from "node:assert/strict";
import { test } from "node:test";
import { LIVE_SOURCES, LIVE_SOURCE_SET } from "./live_sources";
import { RESERVED_LIVE_SOURCES as EVENT_RESERVED } from "./events_validate";
import { RESERVED_LIVE_SOURCES as INSIGHT_RESERVED } from "./insights_validate";

const EXPECTED = [
  "bls",
  "onet",
  "scorecard",
  "apprenticeship_gov",
  "bls_ep",
  "ipeds",
  "careeronestop",
  "census",
  "bea",
  "fred",
];

test("LIVE_SOURCES is the canonical reserved set", () => {
  assert.deepEqual([...LIVE_SOURCES], EXPECTED);
  for (const source of EXPECTED) {
    assert.equal(LIVE_SOURCE_SET.has(source), true, source);
    assert.equal(EVENT_RESERVED.has(source), true, `events ${source}`);
    assert.equal(INSIGHT_RESERVED.has(source), true, `insights ${source}`);
  }
});

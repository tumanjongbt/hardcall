import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventSourceBadge,
  eventStampKind,
  insightSourceBadge,
  isLiveEventSource,
  pipeProvenanceNote,
  pipeStatusLabel,
  provenanceCounts,
} from "./provenance";

test("event source badges distinguish demo from live adapters", () => {
  assert.deepEqual(eventSourceBadge("synthetic"), { label: "Demo", kind: "demo" });
  assert.deepEqual(eventSourceBadge("playground"), { label: "Playground", kind: "demo" });
  assert.deepEqual(eventSourceBadge("cli"), { label: "CLI", kind: "demo" });
  assert.deepEqual(eventSourceBadge("manual"), { label: "Manual", kind: "demo" });
  assert.deepEqual(eventSourceBadge("bls"), { label: "Live · BLS", kind: "live" });
  assert.deepEqual(eventSourceBadge("onet"), { label: "Live · O*NET", kind: "live" });
  assert.deepEqual(eventSourceBadge("scorecard"), { label: "Live · Scorecard", kind: "live" });
  assert.deepEqual(eventSourceBadge("apprenticeship_gov"), {
    label: "Live · Apprenticeship",
    kind: "live",
  });
  assert.deepEqual(eventSourceBadge(undefined), { label: "Unknown", kind: "demo" });
  assert.equal(isLiveEventSource("bls"), true);
  assert.equal(isLiveEventSource("scorecard"), true);
  assert.equal(isLiveEventSource("synthetic"), false);
});

test("insight synthetic is Demo KPI; missing source is also demo", () => {
  assert.deepEqual(insightSourceBadge("synthetic"), { label: "Demo KPI", kind: "demo" });
  assert.deepEqual(insightSourceBadge(undefined), { label: "Demo KPI", kind: "demo" });
  assert.deepEqual(insightSourceBadge("bls"), { label: "Live · BLS", kind: "live" });
  assert.deepEqual(insightSourceBadge("scorecard"), { label: "Live · Scorecard", kind: "live" });
});

test("pipe status is SSE connection, not live market data", () => {
  assert.equal(pipeStatusLabel("live"), "Pipe live");
  assert.equal(pipeStatusLabel("connecting"), "Connecting");
  assert.equal(pipeStatusLabel("down"), "Stream down");
  assert.equal(
    pipeProvenanceNote("live", 0, 12),
    "SSE live · no live-source rows in this feed"
  );
  assert.equal(pipeProvenanceNote("live", 2, 10), "2 live · 10 demo");
  assert.equal(pipeProvenanceNote("live", 4, 0), "4 live");
  assert.equal(pipeProvenanceNote("connecting", 0, 12), null);
  assert.equal(eventStampKind(null), "posted");
  assert.equal(eventStampKind("2026-09-21T12:00:00.000Z"), "fetched");
});

test("provenanceCounts treats reserved adapters as live", () => {
  assert.deepEqual(
    provenanceCounts([
      { source: "synthetic" },
      { source: "playground" },
      { source: "bls" },
      { source: "scorecard" },
      { source: undefined },
    ]),
    { live: 2, demo: 3 }
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInsightsPayload } from "./api";
import { insightTone, sortInsights } from "./insights";

test("insightTone reads leading sign", () => {
  assert.equal(insightTone("+18%"), "up");
  assert.equal(insightTone("−12%"), "down");
  assert.equal(insightTone("-3 pts"), "down");
  assert.equal(insightTone("91%"), "flat");
});

test("parseInsightsPayload requires insights array", () => {
  assert.deepEqual(parseInsightsPayload({ insights: [] }), []);
  assert.throws(() => parseInsightsPayload({}), /invalid_insights_payload/);
  assert.throws(() => parseInsightsPayload(null), /invalid_insights_payload/);
});

test("sortInsights is updated_at DESC then title ASC", () => {
  const rows = sortInsights([
    {
      id: "1",
      title: "Zeta",
      value: "1",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    },
    {
      id: "2",
      title: "Alpha",
      value: "2",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    },
    {
      id: "3",
      title: "Newest",
      value: "3",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T01:00:00.000Z",
    },
  ]);
  assert.deepEqual(
    rows.map((row) => row.title),
    ["Newest", "Alpha", "Zeta"]
  );
});

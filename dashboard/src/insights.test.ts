import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInsightsPayload } from "./api";
import {
  EMPTY_INSIGHT_DETAIL,
  findInsight,
  insightDetailBody,
  insightTone,
  sortInsights,
} from "./insights";

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
  const [row] = parseInsightsPayload({
    insights: [
      {
        id: "1",
        title: "Top Trade Income Growth",
        value: "+19%",
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      },
    ],
  });
  assert.equal(row?.detail, "");
});

test("findInsight and insightDetailBody", () => {
  const row = {
    id: "abc-1",
    title: "Highest Tuition Payload",
    value: "Traditional 4-Year University",
    detail: "  Sticker cost is the heaviest payload.\nStack aid.  ",
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
  };
  assert.equal(findInsight([row], "abc-1")?.title, row.title);
  assert.equal(findInsight([row], "missing"), null);
  assert.deepEqual(insightDetailBody(""), {
    empty: true,
    text: EMPTY_INSIGHT_DETAIL,
  });
  assert.deepEqual(insightDetailBody(row.detail), {
    empty: false,
    text: "Sticker cost is the heaviest payload.\nStack aid.",
  });
});

test("sortInsights is updated_at DESC then title ASC", () => {
  const rows = sortInsights([
    {
      id: "1",
      title: "Zeta",
      value: "1",
      detail: "",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    },
    {
      id: "2",
      title: "Alpha",
      value: "2",
      detail: "Alpha analysis",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    },
    {
      id: "3",
      title: "Newest",
      value: "3",
      detail: "",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T01:00:00.000Z",
    },
  ]);
  assert.deepEqual(
    rows.map((row) => row.title),
    ["Newest", "Alpha", "Zeta"]
  );
});

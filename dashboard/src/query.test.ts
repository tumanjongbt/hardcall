import assert from "node:assert/strict";
import { test } from "node:test";
import { filterEvents, matchesQuery, paginate } from "./query";
import type { EventRow } from "./types";

const rows: EventRow[] = [
  {
    id: "1",
    channel: "trade",
    title: "Welding night program",
    description: "Open seats",
    emoji: "🔧",
    tags: ["high_school_students"],
    created_at: "2026-09-21T10:00:00.000Z",
  },
  {
    id: "2",
    channel: "university",
    title: "CS salaries up",
    description: "Metro X",
    emoji: "📈",
    tags: ["college_students", "parents"],
    created_at: "2026-09-20T10:00:00.000Z",
  },
  {
    id: "3",
    channel: "trade",
    title: "HVAC demand",
    description: null,
    emoji: null,
    tags: ["parents"],
    created_at: "2026-09-19T10:00:00.000Z",
  },
];

test("filterEvents applies channel and searches title, description, tags", () => {
  assert.deepEqual(
    filterEvents(rows, "trade", "").map((e) => e.id),
    ["1", "3"]
  );
  assert.equal(matchesQuery(rows[0]!, "welding"), true);
  assert.equal(matchesQuery(rows[1]!, "metro"), true);
  assert.equal(matchesQuery(rows[1]!, "college students"), true);
  assert.deepEqual(
    filterEvents(rows, null, "parents").map((e) => e.id),
    ["2", "3"]
  );
  assert.deepEqual(filterEvents(rows, "automation", "welding"), []);
});

test("paginate defaults to 50-sized pages and supports 100 and all", () => {
  const many = Array.from({ length: 120 }, (_, i) => i);
  const page1 = paginate(many, 1, 50);
  assert.equal(page1.items.length, 50);
  assert.equal(page1.pageCount, 3);
  assert.deepEqual(page1.items[0], 0);
  assert.equal(paginate(many, 3, 50).items.length, 20);
  assert.equal(paginate(many, 99, 50).page, 3);
  assert.equal(paginate(many, 1, 100).pageCount, 2);
  assert.equal(paginate(many, 2, "all").items.length, 120);
  assert.equal(paginate(many, 2, "all").page, 1);
});

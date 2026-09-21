import assert from "node:assert/strict";
import { test } from "node:test";
import { filterEvents } from "../query";
import type { EventRow } from "../types";
import {
  WINDOW_DAYS,
  activeChannels,
  channelDistribution,
  chartDataFromEvents,
  dailyActivity,
  lastDayKeys,
} from "./transforms";

const now = new Date("2026-09-21T15:00:00.000Z");

function row(
  id: string,
  channel: string,
  created_at: string,
  extra: Partial<EventRow> = {}
): EventRow {
  return {
    id,
    channel,
    title: extra.title ?? `Event ${id}`,
    description: extra.description ?? null,
    emoji: extra.emoji ?? null,
    tags: extra.tags ?? [],
    created_at,
  };
}

const rows: EventRow[] = [
  row("old", "university", "2026-08-22T12:00:00.000Z", { title: "Too old CS" }),
  row("u1", "university", "2026-08-23T08:00:00.000Z", {
    title: "CS salaries",
    tags: ["college_students"],
  }),
  row("t1", "trade", "2026-09-21T10:00:00.000Z", {
    title: "Welding night",
    description: "Open seats",
    tags: ["high_school_students"],
  }),
  row("t2", "trade", "2026-09-21T11:00:00.000Z", { title: "HVAC demand" }),
  row("c1", "community_college", "2026-09-10T00:00:00.000Z"),
  row("a1", "apprenticeship", "2026-09-01T00:00:00.000Z"),
  row("m1", "automation", "2026-09-05T00:00:00.000Z"),
];

test("lastDayKeys yields 30 UTC days ending today", () => {
  const keys = lastDayKeys(now, WINDOW_DAYS);
  assert.equal(keys.length, 30);
  assert.equal(keys[0], "2026-08-23");
  assert.equal(keys[keys.length - 1], "2026-09-21");
});

test("dailyActivity buckets last 30 days and ignores older events", () => {
  const buckets = dailyActivity(rows, now);
  assert.equal(buckets.length, 30);
  assert.equal(buckets[0]?.key, "2026-08-23");
  assert.equal(buckets[0]?.count, 1);
  assert.equal(buckets[0]?.label, "Aug 23");
  const today = buckets[buckets.length - 1];
  assert.equal(today?.key, "2026-09-21");
  assert.equal(today?.count, 2);
  assert.equal(
    buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    6
  );
});

test("channelDistribution uses friendly labels and percents across all five channels", () => {
  const slices = channelDistribution(rows);
  assert.deepEqual(
    slices.map((slice) => slice.label),
    ["University", "Community College", "Trade", "Apprenticeship", "Automation"]
  );
  const byChannel = Object.fromEntries(slices.map((slice) => [slice.channel, slice]));
  assert.equal(byChannel.university?.count, 2);
  assert.equal(byChannel.trade?.count, 2);
  assert.equal(byChannel.community_college?.count, 1);
  assert.equal(byChannel.apprenticeship?.count, 1);
  assert.equal(byChannel.automation?.count, 1);
  assert.equal(byChannel.university?.percent, (2 / 7) * 100);
  assert.equal(byChannel.trade?.percent, (2 / 7) * 100);
});

test("charts recompute from the same channel + search subset as the feed", () => {
  const filtered = filterEvents(rows, "trade", "welding");
  assert.deepEqual(
    filtered.map((event) => event.id),
    ["t1"]
  );
  const data = chartDataFromEvents(filtered, now, { channel: "trade" });
  assert.equal(
    data.activity.reduce((sum, bucket) => sum + bucket.count, 0),
    1
  );
  const nonzero = data.distribution.filter((slice) => slice.count > 0);
  assert.deepEqual(
    nonzero.map((slice) => slice.channel),
    ["trade"]
  );
  assert.equal(nonzero[0]?.percent, 100);
  assert.equal(chartDataFromEvents(rows, now).byChannel.length, 5);
  assert.deepEqual(
    data.byChannel.map((series) => series.channel),
    ["trade"]
  );
  assert.equal(data.byChannel[0]?.buckets[data.byChannel[0].buckets.length - 1]?.count, 1);
});

test("activeChannels is the channel filter, or all five when unfiltered", () => {
  assert.deepEqual(activeChannels(rows, "automation"), ["automation"]);
  assert.deepEqual(activeChannels(rows, null), [
    "university",
    "community_college",
    "trade",
    "apprenticeship",
    "automation",
  ]);
});

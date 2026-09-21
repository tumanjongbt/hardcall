import assert from "node:assert/strict";
import { test } from "node:test";
import { filterEvents } from "../query";
import type { EventRow } from "../types";
import {
  WINDOW_DAYS,
  activeChannels,
  automationSplit,
  channelDistribution,
  channelRanks,
  channelWeekdayHeat,
  chartDataFromEvents,
  dailyActivity,
  eventsInRange,
  formatDeltaLabel,
  compareIsEmpty,
  detectSpikes,
  forecastBand,
  futureDayKeys,
  lastDayKeys,
  pathCompare,
  seriesVintage,
  stackedDaily,
  stakeholderBreakdown,
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
  row("c1", "community_college", "2026-09-10T00:00:00.000Z", {
    tags: ["career_counselors"],
  }),
  row("a1", "apprenticeship", "2026-09-01T00:00:00.000Z", {
    tags: ["parents", "high_school_students"],
  }),
  row("m1", "automation", "2026-09-05T00:00:00.000Z", {
    tags: ["workforce_training_managers"],
  }),
  row("u2", "university", "2026-09-18T09:00:00.000Z", {
    tags: ["college_students", "parents"],
  }),
  row("t3", "trade", "2026-09-14T12:00:00.000Z", {
    tags: ["career_counselors"],
  }),
];

test("lastDayKeys yields 30 UTC days ending today", () => {
  const keys = lastDayKeys(now, WINDOW_DAYS);
  assert.equal(keys.length, 30);
  assert.equal(keys[0], "2026-08-23");
  assert.equal(keys[keys.length - 1], "2026-09-21");
});

test("lastDayKeys supports 7, 14, and 90 day presets", () => {
  const week = lastDayKeys(now, 7);
  assert.equal(week.length, 7);
  assert.equal(week[0], "2026-09-15");
  assert.equal(week[6], "2026-09-21");
  const fortnight = lastDayKeys(now, 14);
  assert.equal(fortnight.length, 14);
  assert.equal(fortnight[0], "2026-09-08");
  const hist90 = lastDayKeys(now, 90);
  assert.equal(hist90.length, 90);
  assert.equal(hist90[0], "2026-06-24");
  assert.equal(hist90[89], "2026-09-21");
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
    8
  );
});

test("eventsInRange and dailyActivity honor a 7-day window", () => {
  const week = eventsInRange(rows, now, 7);
  assert.deepEqual(
    week.map((event) => event.id).sort(),
    ["t1", "t2", "u2"]
  );
  const buckets = dailyActivity(rows, now, 7);
  assert.equal(buckets.length, 7);
  assert.equal(
    buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    3
  );
});

test("channelDistribution uses friendly labels and percents across all five channels", () => {
  const slices = channelDistribution(rows);
  assert.deepEqual(
    slices.map((slice) => slice.label),
    ["University", "Community College", "Trade", "Apprenticeship", "Automation"]
  );
  const byChannel = Object.fromEntries(slices.map((slice) => [slice.channel, slice]));
  assert.equal(byChannel.university?.count, 3);
  assert.equal(byChannel.trade?.count, 3);
  assert.equal(byChannel.community_college?.count, 1);
  assert.equal(byChannel.apprenticeship?.count, 1);
  assert.equal(byChannel.automation?.count, 1);
  assert.equal(byChannel.university?.percent, (3 / 9) * 100);
  assert.equal(byChannel.trade?.percent, (3 / 9) * 100);
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

test("audience lens filters stakeholder tags before chart aggregates", () => {
  const parents = filterEvents(rows, null, "", "parents");
  assert.deepEqual(
    parents.map((event) => event.id).sort(),
    ["a1", "u2"]
  );
  const students = filterEvents(rows, null, "", "students");
  assert.ok(students.some((event) => event.id === "t1"));
  assert.ok(students.some((event) => event.id === "u1"));
  assert.ok(students.some((event) => event.id === "u2"));
  assert.ok(!students.some((event) => event.id === "c1"));
  const data = chartDataFromEvents(parents, now, { days: 30 });
  assert.equal(data.inRangeCount, 2);
  assert.equal(
    data.distribution.find((slice) => slice.channel === "university")?.count,
    1
  );
  assert.equal(
    data.distribution.find((slice) => slice.channel === "apprenticeship")?.count,
    1
  );
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

test("stackedDaily composition sums to the activity line each day", () => {
  const stacked = stackedDaily(rows, now, 30);
  const activity = dailyActivity(rows, now, 30);
  assert.equal(stacked.length, activity.length);
  for (let i = 0; i < stacked.length; i += 1) {
    const day = stacked[i];
    const sum = day
      ? Object.values(day.counts).reduce((total, count) => total + count, 0)
      : 0;
    assert.equal(sum, activity[i]?.count);
  }
  const today = stacked[stacked.length - 1];
  assert.equal(today?.counts.trade, 2);
  assert.equal(today?.counts.university, 0);
});

test("stakeholderBreakdown counts multi-tag events in each matching audience", () => {
  const slices = stakeholderBreakdown(eventsInRange(rows, now, 30));
  const byTag = Object.fromEntries(slices.map((slice) => [slice.tag, slice]));
  assert.equal(byTag.high_school_students?.count, 2);
  assert.equal(byTag.college_students?.count, 2);
  assert.equal(byTag.parents?.count, 2);
  assert.equal(byTag.career_counselors?.count, 2);
  assert.equal(byTag.workforce_training_managers?.count, 1);
  assert.equal(byTag.parents?.label, "Parents");
});

test("channelWeekdayHeat is UTC weekday × channel", () => {
  const heat = channelWeekdayHeat(rows, now, 7);
  assert.deepEqual([...heat.weekdays], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const trade = heat.rows.find((rowItem) => rowItem.channel === "trade");
  // 2026-09-21 is a Monday (UTC)
  assert.equal(trade?.cells[1], 2);
  const uni = heat.rows.find((rowItem) => rowItem.channel === "university");
  // 2026-09-18 is a Friday
  assert.equal(uni?.cells[5], 1);
  assert.ok(heat.max >= 2);
});

test("automationSplit groups automation vs the four human paths", () => {
  const split = automationSplit(eventsInRange(rows, now, 30));
  assert.equal(split.automation, 1);
  assert.equal(split.human, 7);
  assert.equal(split.total, 8);
  assert.equal(split.automationPercent, (1 / 8) * 100);
  assert.equal(split.humanPercent, (7 / 8) * 100);
});

test("pathCompare dual series answers which path is drawing more signal", () => {
  const compare = pathCompare(rows, now, 7, ["trade", "university"]);
  assert.ok(compare);
  assert.equal(compare.a.channel, "trade");
  assert.equal(compare.b.channel, "university");
  assert.equal(compare.totalA, 2);
  assert.equal(compare.totalB, 1);
  assert.equal(compare.leader, "trade");
  assert.equal(pathCompare(rows, now, 7, ["trade"]), null);
  assert.equal(pathCompare(rows, now, 7, ["trade", "trade"]), null);
  assert.equal(compareIsEmpty(compare), false);
  const emptyPair = pathCompare(
    rows.filter((item) => item.channel === "automation"),
    now,
    7,
    ["trade", "university"]
  );
  assert.equal(compareIsEmpty(emptyPair), true);
  assert.equal(compareIsEmpty(null), false);
});

test("formatDeltaLabel covers flat, new, and percent change", () => {
  assert.equal(formatDeltaLabel(0, 0), "flat");
  assert.equal(formatDeltaLabel(4, 0), "new");
  assert.equal(formatDeltaLabel(4, 2), "+100%");
  assert.equal(formatDeltaLabel(1, 2), "-50%");
  assert.equal(formatDeltaLabel(10, 10), "flat");
});

test("channelRanks include share, dod/wow when computable, and a so-what", () => {
  const ranks = channelRanks(rows, now, 30);
  assert.equal(ranks[0]?.channel, "trade");
  assert.equal(ranks[0]?.count, 3);
  assert.ok(ranks[0]?.soWhat.includes("Hands-on"));
  const seven = channelRanks(rows, now, 7);
  assert.equal(seven.find((rowItem) => rowItem.channel === "trade")?.wowLabel, "—");
  const thirtyTrade = ranks.find((rowItem) => rowItem.channel === "trade");
  assert.equal(thirtyTrade?.dodLabel, "new");
  assert.notEqual(thirtyTrade?.wowLabel, "—");
});

test("chartDataFromEvents wires range, compare, and in-window doughnut together", () => {
  const data = chartDataFromEvents(rows, now, {
    days: 7,
    compare: ["trade", "university"],
    horizon: 14,
  });
  assert.equal(data.days, 7);
  assert.equal(data.horizon, 14);
  assert.equal(data.inRangeCount, 3);
  assert.equal(data.activity.length, 7);
  assert.equal(data.stacked.length, 7);
  assert.equal(data.compare?.leader, "trade");
  assert.equal(
    data.distribution.find((slice) => slice.channel === "trade")?.count,
    2
  );
  assert.equal(
    data.distribution.find((slice) => slice.channel === "apprenticeship")?.count,
    0
  );
  assert.equal(data.ranks.length, 5);
  assert.equal(data.forecast.points.length, 14);
  assert.equal(data.forecast.points[0]?.key, "2026-09-22");
  assert.equal(data.forecast.method, "naive-hist-band");
  assert.equal(data.forecast.uncertainty, "high");
  assert.equal(data.vintage.source, "GET /api/events");
  assert.equal(data.vintage.asOf, "2026-09-21");
  assert.equal(data.split.resilienceScore, data.split.humanPercent);
});

test("forecastBand is a naive hist band for 14 or 30 UTC days and stays non-negative", () => {
  const keys = futureDayKeys(now, 14);
  assert.equal(keys.length, 14);
  assert.equal(keys[0], "2026-09-22");
  assert.equal(keys[13], "2026-10-05");
  const activity = dailyActivity(rows, now, 90);
  const band14 = forecastBand(activity, now, 14);
  const band30 = forecastBand(activity, now, 30);
  assert.equal(band14.method, "naive-hist-band");
  assert.equal(band14.points.length, 14);
  assert.equal(band30.points.length, 30);
  for (const point of band30.points) {
    assert.ok(point.low >= 0);
    assert.ok(point.mean >= point.low);
    assert.ok(point.high >= point.mean);
    assert.ok(point.high > point.low);
  }
  const flat = forecastBand(
    lastDayKeys(now, 90).map((key) => ({ key, label: key, count: 4 })),
    now,
    14
  );
  assert.equal(flat.method, "naive-hist-band");
  assert.equal(flat.uncertainty, "normal");
  assert.ok(flat.points.every((point) => point.mean === 4));
});

test("same-day seed still gets a wide naive band", () => {
  const sameDay = lastDayKeys(now, 90).map((key, index, list) => ({
    key,
    label: key,
    count: index === list.length - 1 ? 80 : 0,
  }));
  const band = forecastBand(sameDay, now, 30);
  assert.equal(band.method, "naive-hist-band");
  assert.equal(band.uncertainty, "high");
  assert.equal(band.points.length, 30);
  assert.equal(band.level, 80);
  assert.ok(band.pad >= 80);
});

test("seriesVintage is as-of the latest event day from GET /api/events", () => {
  const vintage = seriesVintage(rows, now);
  assert.equal(vintage.asOf, "2026-09-21");
  assert.equal(vintage.source, "GET /api/events");
});

test("detectSpikes flags days well above the window run-rate", () => {
  const buckets = lastDayKeys(now, 14).map((key, index) => ({
    key,
    label: key,
    count: index === 13 ? 20 : 1,
  }));
  const spikes = detectSpikes(buckets);
  assert.equal(spikes.length, 1);
  assert.equal(spikes[0]?.key, "2026-09-21");
  assert.ok((spikes[0]?.z ?? 0) >= 1.5);
  assert.deepEqual(
    detectSpikes(buckets.map((bucket) => ({ ...bucket, count: 3 }))),
    []
  );
});

import {
  CHANNELS,
  CHANNEL_LABELS,
  HUMAN_CHANNELS,
  STAKEHOLDER_TAGS,
  isChannel,
  tagLabel,
  type Channel,
} from "../channels";
import type { EventRow } from "../types";
import { CHANNEL_SO_WHAT, EVENTS_SOURCE, rowSoWhat } from "./copy";

export const WINDOW_DAYS = 30;
export const DEFAULT_RANGE_DAYS = 90;
export { EVENTS_SOURCE };
export const MIN_TREND_OCCUPIED_DAYS = 7;
export const RANGE_PRESETS = [7, 14, 30, 90] as const;
export const FORECAST_HORIZONS = [14, 30] as const;
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const SPIKE_Z = 1.5;

export type DayBucket = {
  key: string;
  label: string;
  count: number;
};

export type ChannelSlice = {
  channel: Channel;
  label: string;
  count: number;
  percent: number;
};

export type ChannelSeries = {
  channel: Channel;
  label: string;
  buckets: DayBucket[];
};

export type StackedDay = {
  key: string;
  label: string;
  counts: Record<Channel, number>;
};

export type StakeholderSlice = {
  tag: string;
  label: string;
  count: number;
  percent: number;
};

export type HeatMatrix = {
  weekdays: readonly string[];
  rows: Array<{
    channel: Channel;
    label: string;
    cells: number[];
  }>;
  max: number;
};

export type PathSplit = {
  automation: number;
  human: number;
  total: number;
  automationPercent: number;
  humanPercent: number;
  /** Human-path share (0–100). Higher = more of this window is on people-still-hire paths. */
  resilienceScore: number;
};

export type SpikeDay = {
  key: string;
  label: string;
  count: number;
  z: number;
};

export type ForecastPoint = {
  key: string;
  label: string;
  mean: number;
  low: number;
  high: number;
};

export type ForecastUncertainty = "normal" | "high";

export type ForecastBand = {
  horizon: number;
  reliable: boolean;
  method: "naive-hist-band";
  uncertainty: ForecastUncertainty;
  level: number;
  pad: number;
  points: ForecastPoint[];
};

export type HistoryQuality = {
  occupiedDays: number;
  spanDays: number;
  coverage: number;
  sparse: boolean;
  singleDay: boolean;
  firstKey: string | null;
  lastKey: string | null;
};

export type SeriesVintage = {
  asOf: string;
  source: typeof EVENTS_SOURCE;
};

export type CompareSeries = {
  a: ChannelSeries;
  b: ChannelSeries;
  totalA: number;
  totalB: number;
  leader: Channel | null;
};

export type ChannelRankRow = {
  channel: Channel;
  label: string;
  count: number;
  percent: number;
  dodLabel: string;
  wowLabel: string;
  soWhat: string;
};

export type ChartData = {
  days: number;
  horizon: number;
  inRangeCount: number;
  activity: DayBucket[];
  distribution: ChannelSlice[];
  byChannel: ChannelSeries[];
  stacked: StackedDay[];
  stakeholders: StakeholderSlice[];
  heat: HeatMatrix;
  split: PathSplit;
  compare: CompareSeries | null;
  ranks: ChannelRankRow[];
  spikes: SpikeDay[];
  forecast: ForecastBand;
  history: HistoryQuality;
  vintage: SeriesVintage;
};

export function utcDayKey(isoOrDate: string | Date): string | null {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function formatDayLabel(key: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function lastDayKeys(now: Date, days = WINDOW_DAYS): string[] {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - offset);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

export function eventsInRange(events: EventRow[], now: Date, days = WINDOW_DAYS): EventRow[] {
  const keys = new Set(lastDayKeys(now, days));
  return events.filter((event) => {
    const key = utcDayKey(event.created_at);
    return key !== null && keys.has(key);
  });
}

export function dailyActivity(
  events: EventRow[],
  now: Date,
  days = WINDOW_DAYS
): DayBucket[] {
  const keys = lastDayKeys(now, days);
  const counts = new Map(keys.map((key) => [key, 0]));
  for (const event of events) {
    const key = utcDayKey(event.created_at);
    if (!key || !counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({
    key,
    label: formatDayLabel(key),
    count: counts.get(key) ?? 0,
  }));
}

function emptyChannelCounts(): Record<Channel, number> {
  return Object.fromEntries(CHANNELS.map((channel) => [channel, 0])) as Record<Channel, number>;
}

export function stackedDaily(
  events: EventRow[],
  now: Date,
  days = WINDOW_DAYS
): StackedDay[] {
  const keys = lastDayKeys(now, days);
  const byDay = new Map(keys.map((key) => [key, emptyChannelCounts()]));
  for (const event of events) {
    const key = utcDayKey(event.created_at);
    if (!key || !isChannel(event.channel)) continue;
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket[event.channel] += 1;
  }
  return keys.map((key) => ({
    key,
    label: formatDayLabel(key),
    counts: byDay.get(key) ?? emptyChannelCounts(),
  }));
}

export function channelDistribution(events: EventRow[]): ChannelSlice[] {
  const counts = emptyChannelCounts();
  let total = 0;
  for (const event of events) {
    if (!isChannel(event.channel)) continue;
    counts[event.channel] += 1;
    total += 1;
  }
  return CHANNELS.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    count: counts[channel],
    percent: total === 0 ? 0 : (counts[channel] / total) * 100,
  }));
}

export function stakeholderBreakdown(events: EventRow[]): StakeholderSlice[] {
  const counts = Object.fromEntries(STAKEHOLDER_TAGS.map((tag) => [tag, 0])) as Record<
    string,
    number
  >;
  let tagged = 0;
  for (const event of events) {
    const hits = new Set(event.tags.filter((tag) => tag in counts));
    if (hits.size === 0) continue;
    tagged += 1;
    for (const tag of hits) counts[tag] += 1;
  }
  return STAKEHOLDER_TAGS.map((tag) => ({
    tag,
    label: tagLabel(tag),
    count: counts[tag],
    percent: tagged === 0 ? 0 : (counts[tag] / tagged) * 100,
  }));
}

export function channelWeekdayHeat(
  events: EventRow[],
  now: Date,
  days = WINDOW_DAYS,
  channelFilter: string | null = null
): HeatMatrix {
  const inWindow = eventsInRange(events, now, days);
  const channels = activeChannels(inWindow, channelFilter);
  const rows = channels.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    cells: [0, 0, 0, 0, 0, 0, 0],
  }));
  const index = new Map(rows.map((row) => [row.channel, row]));
  for (const event of inWindow) {
    if (!isChannel(event.channel)) continue;
    const row = index.get(event.channel);
    if (!row) continue;
    const date = new Date(event.created_at);
    if (Number.isNaN(date.getTime())) continue;
    row.cells[date.getUTCDay()] += 1;
  }
  const max = rows.reduce((peak, row) => Math.max(peak, ...row.cells), 0);
  return { weekdays: WEEKDAY_LABELS, rows, max };
}

export function automationSplit(events: EventRow[]): PathSplit {
  let automation = 0;
  let human = 0;
  for (const event of events) {
    if (event.channel === "automation") automation += 1;
    else if ((HUMAN_CHANNELS as readonly string[]).includes(event.channel)) human += 1;
  }
  const total = automation + human;
  const humanPercent = total === 0 ? 0 : (human / total) * 100;
  return {
    automation,
    human,
    total,
    automationPercent: total === 0 ? 0 : (automation / total) * 100,
    humanPercent,
    resilienceScore: humanPercent,
  };
}

export function activeChannels(
  _events: EventRow[],
  channelFilter: string | null
): Channel[] {
  if (channelFilter && isChannel(channelFilter)) return [channelFilter];
  return [...CHANNELS];
}

export function channelActivity(
  events: EventRow[],
  now: Date,
  days = WINDOW_DAYS,
  channelFilter: string | null = null
): ChannelSeries[] {
  return activeChannels(events, channelFilter).map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    buckets: dailyActivity(
      events.filter((event) => event.channel === channel),
      now,
      days
    ),
  }));
}

export function seriesTotal(series: ChannelSeries): number {
  return series.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

export function compareIsEmpty(compare: CompareSeries | null): boolean {
  return compare !== null && compare.totalA === 0 && compare.totalB === 0;
}

export function pathCompare(
  events: EventRow[],
  now: Date,
  days: number,
  compare: string[]
): CompareSeries | null {
  const unique = compare.filter((channel, index) => isChannel(channel) && compare.indexOf(channel) === index);
  if (unique.length < 2 || !isChannel(unique[0]) || !isChannel(unique[1])) return null;
  const aChannel = unique[0];
  const bChannel = unique[1];
  const a: ChannelSeries = {
    channel: aChannel,
    label: CHANNEL_LABELS[aChannel],
    buckets: dailyActivity(
      events.filter((event) => event.channel === aChannel),
      now,
      days
    ),
  };
  const b: ChannelSeries = {
    channel: bChannel,
    label: CHANNEL_LABELS[bChannel],
    buckets: dailyActivity(
      events.filter((event) => event.channel === bChannel),
      now,
      days
    ),
  };
  const totalA = seriesTotal(a);
  const totalB = seriesTotal(b);
  return {
    a,
    b,
    totalA,
    totalB,
    leader: totalA === totalB ? null : totalA > totalB ? aChannel : bChannel,
  };
}

export function formatDeltaLabel(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "flat";
  if (previous === 0) return "new";
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return "flat";
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function futureDayKeys(now: Date, horizon: number): string[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const keys: string[] = [];
  for (let offset = 1; offset <= horizon; offset += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + offset);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

export function detectSpikes(buckets: DayBucket[], zThreshold = SPIKE_Z): SpikeDay[] {
  const counts = buckets.map((bucket) => bucket.count);
  const avg = mean(counts);
  const sd = sampleStddev(counts);
  if (sd === 0) return [];
  return buckets
    .filter((bucket) => {
      const z = (bucket.count - avg) / sd;
      return z >= zThreshold && bucket.count >= 2 && bucket.count > avg;
    })
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      count: bucket.count,
      z: (bucket.count - avg) / sd,
    }));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function historyQuality(buckets: DayBucket[]): HistoryQuality {
  const occupied = buckets.filter((bucket) => bucket.count > 0);
  const firstKey = occupied[0]?.key ?? null;
  const lastKey = occupied[occupied.length - 1]?.key ?? null;
  let spanDays = 0;
  if (firstKey && lastKey) {
    const first = Date.parse(`${firstKey}T00:00:00.000Z`);
    const last = Date.parse(`${lastKey}T00:00:00.000Z`);
    spanDays = Math.max(1, Math.round((last - first) / 86_400_000) + 1);
  }
  const occupiedDays = occupied.length;
  const coverage = buckets.length === 0 ? 0 : occupiedDays / buckets.length;
  const singleDay = occupiedDays <= 1;
  const sparse =
    occupiedDays < MIN_TREND_OCCUPIED_DAYS || spanDays < MIN_TREND_OCCUPIED_DAYS || singleDay;
  return {
    occupiedDays,
    spanDays,
    coverage,
    sparse,
    singleDay,
    firstKey,
    lastKey,
  };
}

export function seriesVintage(events: EventRow[], now: Date): SeriesVintage {
  let latest: string | null = null;
  for (const event of events) {
    const key = utcDayKey(event.created_at);
    if (!key) continue;
    if (!latest || key > latest) latest = key;
  }
  return {
    asOf: latest ?? utcDayKey(now) ?? now.toISOString().slice(0, 10),
    source: EVENTS_SOURCE,
  };
}

/**
 * Naive 14/30-day band off the historical daily series: last occupied day's
 * count carried forward, ± hist SD. Sparse / same-day seed still emits a
 * wider band so uncertainty stays visible. Not a wage or ROI guarantee.
 */
export function forecastBand(
  buckets: DayBucket[],
  now: Date,
  horizon: number
): ForecastBand {
  const quality = historyQuality(buckets);
  const uncertainty: ForecastUncertainty = quality.sparse ? "high" : "normal";
  const keys = futureDayKeys(now, Math.max(0, horizon));
  const counts = buckets.map((bucket) => bucket.count);
  const occupied = counts.filter((count) => count > 0);
  const level = occupied[occupied.length - 1] ?? 0;
  const sd = sampleStddev(counts);
  const occupiedMean = mean(occupied);
  const pad =
    uncertainty === "high"
      ? Math.max(sd, level, occupiedMean, 1) * 1.5
      : Math.max(sd, 0.5);

  const points: ForecastPoint[] = keys.map((key) => {
    const meanValue = round1(Math.max(0, level));
    const low = Math.max(0, round1(level - pad));
    const high = Math.max(meanValue, round1(level + pad));
    return {
      key,
      label: formatDayLabel(key),
      mean: meanValue,
      low,
      high,
    };
  });

  return {
    horizon,
    reliable: true,
    method: "naive-hist-band",
    uncertainty,
    level: round1(level),
    pad: round1(pad),
    points,
  };
}

function lastVsPrevious(buckets: DayBucket[]): string {
  if (buckets.length < 2) return "—";
  const last = buckets[buckets.length - 1]?.count ?? 0;
  const prev = buckets[buckets.length - 2]?.count ?? 0;
  return formatDeltaLabel(last, prev);
}

function wowLabel(buckets: DayBucket[], days: number): string {
  if (days < 14 || buckets.length < 14) return "—";
  const last7 = buckets.slice(-7).reduce((sum, bucket) => sum + bucket.count, 0);
  const prev7 = buckets.slice(-14, -7).reduce((sum, bucket) => sum + bucket.count, 0);
  return formatDeltaLabel(last7, prev7);
}

export function channelRanks(
  events: EventRow[],
  now: Date,
  days = WINDOW_DAYS
): ChannelRankRow[] {
  const series = channelActivity(events, now, days, null);
  const total = series.reduce((sum, item) => sum + seriesTotal(item), 0);
  const rows: ChannelRankRow[] = series.map((item) => {
    const count = seriesTotal(item);
    const wow = wowLabel(item.buckets, days);
    const row = {
      channel: item.channel,
      label: item.label,
      count,
      percent: total === 0 ? 0 : (count / total) * 100,
      dodLabel: lastVsPrevious(item.buckets),
      wowLabel: wow,
      soWhat: CHANNEL_SO_WHAT[item.channel],
    };
    return { ...row, soWhat: rowSoWhat(row) };
  });
  rows.sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
  return rows;
}

export function chartDataFromEvents(
  events: EventRow[],
  now: Date = new Date(),
  options: {
    days?: number;
    channel?: string | null;
    compare?: string[];
    horizon?: number;
  } = {}
): ChartData {
  const days = options.days ?? DEFAULT_RANGE_DAYS;
  const channel = options.channel ?? null;
  const horizon = options.horizon ?? 14;
  const inRange = eventsInRange(events, now, days);
  const activity = dailyActivity(events, now, days);
  const compare = pathCompare(events, now, days, options.compare ?? []);
  return {
    days,
    horizon,
    inRangeCount: inRange.length,
    activity,
    distribution: channelDistribution(inRange),
    byChannel: channelActivity(events, now, days, channel),
    stacked: stackedDaily(events, now, days),
    stakeholders: stakeholderBreakdown(inRange),
    heat: channelWeekdayHeat(events, now, days, channel),
    split: automationSplit(inRange),
    compare,
    ranks: channelRanks(events, now, days),
    spikes: detectSpikes(activity),
    forecast: forecastBand(activity, now, horizon),
    history: historyQuality(activity),
    vintage: seriesVintage(events, now),
  };
}

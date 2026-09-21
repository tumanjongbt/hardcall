import { CHANNELS, CHANNEL_LABELS, isChannel, type Channel } from "../channels";
import type { EventRow } from "../types";

export const WINDOW_DAYS = 30;

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

export type ChartData = {
  activity: DayBucket[];
  distribution: ChannelSlice[];
  byChannel: ChannelSeries[];
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

export function channelDistribution(events: EventRow[]): ChannelSlice[] {
  const counts = Object.fromEntries(CHANNELS.map((channel) => [channel, 0])) as Record<
    Channel,
    number
  >;
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

export function visibleChannelSlices(slices: ChannelSlice[]): ChannelSlice[] {
  return slices.filter((slice) => slice.count > 0);
}

export function chartDataFromEvents(
  events: EventRow[],
  now: Date = new Date(),
  options: { days?: number; channel?: string | null } = {}
): ChartData {
  const days = options.days ?? WINDOW_DAYS;
  const channel = options.channel ?? null;
  return {
    activity: dailyActivity(events, now, days),
    distribution: channelDistribution(events),
    byChannel: channelActivity(events, now, days, channel),
  };
}

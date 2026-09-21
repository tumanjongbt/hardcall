import { CHANNEL_LABELS, channelLabel, type Channel } from "../channels";

export const EVENTS_SOURCE = "GET /api/events";

export const DECISION_LINE =
  "Which education path is drawing more labor-market signal right now — and is automation pressure rising?";

export const EMPTY_COMPARE = "No data for selected paths";

/** Short primary-viz captions. Secondary walls live behind More views. */
export const CAPTIONS = {
  activity: "Naive 14–30d band off hist. Not a wage or ROI guarantee.",
  compare: "Which of the two selected paths is drawing more signal right now.",
  table: "Volume, share, and a one-line so-what for the meeting.",
  split: "Automation vs human-path share. Overlay, not a recommendation.",
} as const;

export const INFORMS = {
  doughnut:
    "Where alerts are clustering across the five paths — a first cut for which orbits are talking.",
  bars: "Each path’s daily pulse. Quiet next to busy is a briefing cue, not a verdict.",
  stacked: "Composition over time. Watch whether trade or community college is taking share.",
  stakeholders:
    "Who the alerts are aimed at — parents vs students vs counselors vs workforce.",
  heat: "Which UTC weekdays each path tends to fire. Time outreach for when a path is talking.",
  split:
    "Automation-risk vs human-skill share. A resilience overlay, not a path recommendation.",
} as const;

/** Persistent chip on the forecast chart. Not footer-only. */
export const FORECAST_CHIP = "Non-advisory · not a wage or ROI guarantee";

/** Title/tooltip. Forecasts are telemetry, not a recommendation. */
export const NON_ADVISORY =
  "Not advice. Naive band off GET /api/events history — not a wage or ROI guarantee, and not a recommendation to pick a path.";

/** Visible forecast note after the chip. Must not start with “Not advice”. */
export const FORECAST_NOTE =
  "Naive last-rate ± hist SD from GET /api/events — not a wage or ROI guarantee.";

export const PROJECTED_INTENSITY_LABEL =
  "Projected signal intensity (not a wage or ROI guarantee)";

export const SPARSE_HISTORY =
  "Sparse history: most events sit on a few calendar days. The naive forecast band is still drawn, with a wide uncertainty range.";

export const CHANNEL_SO_WHAT: Record<Channel, string> = {
  university: "Degree-path alert volume in this window. Signal intensity, not tuition value.",
  community_college: "Shorter-credential alert volume in this window.",
  trade: "Hands-on path alert volume in this window.",
  apprenticeship:
    "Paid related-instruction alert volume in this window. Not a wage or ROI guarantee.",
  automation:
    "Displacement / tech-risk alert volume. Overlay on human-path volume, not a career recommendation.",
};

export function historySeriesLabel(
  days: number,
  asOf: string,
  source = EVENTS_SOURCE
): string {
  return `History · last ${days}d · as of ${asOf} · ${source}`;
}

export function forecastSeriesLabel(
  horizon: number,
  asOf: string,
  source = EVENTS_SOURCE
): string {
  return `Naive forecast · next ${horizon}d · as of ${asOf} · ${source}`;
}

export function vintageStrip(
  days: number,
  horizon: number,
  asOf: string,
  source = EVENTS_SOURCE
): string {
  return `Hist last ${days}d · forecast next ${horizon}d · as of ${asOf} · ${source}`;
}

export function rowSoWhat(row: { channel: Channel; wowLabel: string }): string {
  const base = CHANNEL_SO_WHAT[row.channel];
  if (row.wowLabel.startsWith("+")) return `Heating — ${base}`;
  if (row.wowLabel.startsWith("-")) return `Cooling — ${base}`;
  return base;
}

export function compareCaption(series: {
  a: { channel: Channel };
  b: { channel: Channel };
  totalA: number;
  totalB: number;
  leader: Channel | null;
}): string {
  if (series.totalA === 0 && series.totalB === 0) return EMPTY_COMPARE;
  const aName = CHANNEL_LABELS[series.a.channel];
  const bName = CHANNEL_LABELS[series.b.channel];
  if (series.totalA === series.totalB) {
    return `${aName} and ${bName} are drawing the same signal (${series.totalA} event${
      series.totalA === 1 ? "" : "s"
    } each).`;
  }
  const leader = series.leader ? CHANNEL_LABELS[series.leader] : aName;
  const leadN = series.totalA >= series.totalB ? series.totalA : series.totalB;
  const lagName = series.totalA >= series.totalB ? bName : aName;
  const lagN = series.totalA >= series.totalB ? series.totalB : series.totalA;
  if (lagN === 0) return `${leader} has all of the compare-window volume (${leadN}).`;
  return `${leader} is ahead ${leadN} to ${lagN} vs ${lagName}.`;
}

export function splitCaption(split: {
  total: number;
  automationPercent: number;
  humanPercent: number;
}): string {
  if (split.total === 0) {
    return "No events in this window to split. Broaden the lens, range, or search.";
  }
  const auto = Math.round(split.automationPercent);
  if (split.automationPercent >= 40) {
    return `Automation is ${auto}% of this window’s volume. Human-path volume is shown separately — this is a split, not a recommendation.`;
  }
  if (split.automationPercent <= 15) {
    return `Most volume (${Math.round(split.humanPercent)}%) is on human pathways. Automation is a small share in this window.`;
  }
  return `A mixed board (${auto}% automation). Displacement-risk share versus human-path share in this window.`;
}

export function lensHint(lensLabel: string): string {
  return lensLabel === "All"
    ? ""
    : `Keeping events tagged for ${lensLabel}. Students includes high-school and college tags.`;
}

export function comparePairLabel(compare: string[]): string {
  if (compare.length < 2) return "Select two paths to compare.";
  return `${channelLabel(compare[0] ?? "")} vs ${channelLabel(compare[1] ?? "")}`;
}

export function spikeCaption(spikes: Array<{ label: string; count: number }>): string {
  if (spikes.length === 0) return "";
  return `Spike days: ${spikes.map((spike) => `${spike.label} (${spike.count})`).join(", ")}.`;
}

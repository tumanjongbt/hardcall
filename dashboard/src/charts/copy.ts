import { CHANNEL_LABELS, channelLabel, type Channel } from "../channels";

export const DECISION_LINE =
  "Which education path is drawing more labor-market signal right now — and is automation pressure rising?";

/** Honest store footnote — charts follow whatever the API returned. */
export const STORE_FOOTNOTE =
  "Charts aggregate the event store. Live badges mark Scorecard, BLS, O*NET, and registered apprenticeship rows from server-side adapters. Scorecard costs are institution / program cost of attendance — not per-course sticker.";

export const EMPTY_COMPARE = "No data for selected paths";

/** Short primary-viz captions. Secondary walls live behind More views. */
export const CAPTIONS = {
  activity: "Heating or cooling in this window, plus a forward band.",
  compare: "Which of the two selected paths is drawing more signal right now.",
  table: "Volume, share, and a one-line so-what for the meeting.",
} as const;

export const INFORMS = {
  doughnut:
    "Where alerts are clustering across the five paths — a first cut for which orbits are talking.",
  bars: "Each path’s daily pulse. Quiet next to busy is a briefing cue, not a verdict.",
  stacked:
    "Composition over time. Watch whether trade or community college is taking share.",
  stakeholders:
    "Who the alerts are aimed at — parents vs students vs counselors vs workforce.",
  heat: "Which UTC weekdays each path tends to fire. Time outreach for when a path is talking.",
  split:
    "Automation-risk vs human-skill share. A rising automation slice is a resilience check, not a skip-university call.",
} as const;

/** Mandatory. Forecasts and ranks are telemetry, not a recommendation. */
export const NON_ADVISORY =
  "Not advice. This forecast band is a telemetry projection from recent volume — not a recommendation to pick university, trade, or any other path.";

/** Visible forecast note after the Not-advice chip. Must not start with “Not advice”. */
export const FORECAST_NOTE =
  "This forecast band is a telemetry projection from recent volume — not a recommendation to pick university, trade, or any other path.";

export const CHANNEL_SO_WHAT: Record<Channel, string> = {
  university:
    "Degree-path signal. Stress-test net tuition against shorter credentials before locking a four-year plan.",
  community_college:
    "Shorter credential signal. Often the cheaper on-ramp; check waitlists and stackable certs.",
  trade:
    "Hands-on demand. Often lower automation exposure — pair with licensure timelines.",
  apprenticeship:
    "Earn-while-you-learn volume. Strong for cost-sensitive families who need paid related instruction.",
  automation:
    "Displacement / tech-risk alerts. Use as a resilience overlay on the human paths, not a career by itself.",
};

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
    return `Automation is ${auto}% of this window. Check whether human-path volume is also rising.`;
  }
  if (split.automationPercent <= 15) {
    return `Most signal (${Math.round(split.humanPercent)}%) is still on human pathways. Automation is a watch item.`;
  }
  return `A mixed board (${auto}% automation). Keep displacement risk in the conversation.`;
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

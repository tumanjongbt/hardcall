import { CHANNEL_LABELS, channelLabel, type Channel } from "../channels";

export const INFORMS = {
  activity:
    "Whether a path is heating up or cooling off in this window. Families can see if an option is still drawing live labor signal before committing time or tuition.",
  doughnut:
    "Where alerts are clustering across university, community college, trade, apprenticeship, and automation. A first cut for which orbits are actually talking right now.",
  bars: "Each path’s daily pulse. Quiet university days next to busy trade days are a prompt for counselors: is this a blip or a shift?",
  stacked:
    "Composition over time — better for counselors than a doughnut snapshot. Watch whether trade or community college is taking share, or automation alerts are crowding the feed.",
  stakeholders:
    "Who the alerts are aimed at. If parents dominate, lead with cost and outcomes; if students dominate, lead with openings and next steps.",
  heat: "Which weekdays each path tends to fire (UTC). Time outreach for when a path is actually talking — Monday trade surges are a different briefing than Friday automation alerts.",
  split:
    "How much of this window is automation-risk versus human-skill pathways. A rising automation slice is a resilience check, not an automatic “skip university” call.",
  compare:
    "Which path is drawing more signal right now? Use this when a student is torn between two options — for example trade vs university.",
  table:
    "Scannable ranking: volume, share, and whether the path is up or down versus yesterday or last week — plus a one-line “so what” for the meeting.",
  forecast:
    "A 14- or 30-day envelope around the recent run-rate and weekday mix. Use it to see whether a path is likely to stay noisy — not to choose a school.",
  spikes:
    "Days that jumped well above this window’s typical volume. A spike is a briefing cue, not proof a path stays hot.",
} as const;

/** Mandatory. Forecasts and ranks are telemetry, not a recommendation. */
export const NON_ADVISORY =
  "Not advice. This forecast band is a telemetry projection from recent volume — not a recommendation to pick university, trade, or any other path.";

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
  const aName = CHANNEL_LABELS[series.a.channel];
  const bName = CHANNEL_LABELS[series.b.channel];
  if (series.totalA === series.totalB) {
    return `${aName} and ${bName} are drawing the same signal right now (${series.totalA} event${
      series.totalA === 1 ? "" : "s"
    } each). Which path is drawing more signal right now? It’s a tie in this window.`;
  }
  const leader = series.leader ? CHANNEL_LABELS[series.leader] : aName;
  const leadN = series.totalA >= series.totalB ? series.totalA : series.totalB;
  const lagName = series.totalA >= series.totalB ? bName : aName;
  const lagN = series.totalA >= series.totalB ? series.totalB : series.totalA;
  const extra =
    lagN === 0
      ? `${leader} has all of the compare-window volume (${leadN}).`
      : `${leader} is ahead ${leadN} to ${lagN} (${Math.round(((leadN - lagN) / lagN) * 100)}% more).`;
  return `Which path is drawing more signal right now? ${extra} ${leader} vs ${lagName}.`;
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
    return `Automation is ${auto}% of this window. Before steering anyone away from university, check whether human-path volume is also rising.`;
  }
  if (split.automationPercent <= 15) {
    return `Most signal (${Math.round(split.humanPercent)}%) is still on human pathways (university, community college, trade, apprenticeship). Automation is a watch item, not the story.`;
  }
  return `A mixed board (${auto}% automation). Keep displacement risk in the conversation while comparing the four human paths on cost, time, and placement.`;
}

export function lensHint(lensLabel: string): string {
  return lensLabel === "All"
    ? "Showing every stakeholder tag."
    : `Keeping events tagged for ${lensLabel}. Students includes high-school and college tags.`;
}

export function comparePairLabel(compare: string[]): string {
  if (compare.length < 2) return "Select two paths to compare.";
  return `${channelLabel(compare[0] ?? "")} vs ${channelLabel(compare[1] ?? "")}`;
}

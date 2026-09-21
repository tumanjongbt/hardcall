export const CHANNELS = [
  "university",
  "community_college",
  "trade",
  "apprenticeship",
  "automation",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  university: "University",
  community_college: "Community College",
  trade: "Trade",
  apprenticeship: "Apprenticeship",
  automation: "Automation",
};

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export function channelLabel(channel: string): string {
  return isChannel(channel) ? CHANNEL_LABELS[channel] : channel;
}

export const TAG_LABELS: Record<string, string> = {
  high_school_students: "High school students",
  college_students: "College students",
  parents: "Parents",
  career_counselors: "Career counselors",
  workforce_training_managers: "Workforce training managers",
};

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag.replaceAll("_", " ");
}

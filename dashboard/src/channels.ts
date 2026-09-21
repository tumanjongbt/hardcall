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

export const TAGS = [
  "high_school_students",
  "college_students",
  "parents",
  "career_counselors",
  "workforce_training_managers",
] as const;

export type StakeholderTag = (typeof TAGS)[number];

export const TAG_LABELS: Record<StakeholderTag, string> = {
  high_school_students: "High school students",
  college_students: "College students",
  parents: "Parents",
  career_counselors: "Career counselors",
  workforce_training_managers: "Workforce training managers",
};

export const STAKEHOLDER_TAGS = [
  "high_school_students",
  "college_students",
  "parents",
  "career_counselors",
  "workforce_training_managers",
] as const;

export type StakeholderTag = (typeof STAKEHOLDER_TAGS)[number];

export const AUDIENCE_LENSES = [
  "students",
  "parents",
  "counselors",
  "workforce",
] as const;

export type AudienceLensId = (typeof AUDIENCE_LENSES)[number];

export const LENS_LABELS: Record<AudienceLensId, string> = {
  students: "Students",
  parents: "Parents",
  counselors: "Counselors",
  workforce: "Workforce",
};

/** Stakeholder tags included in each audience lens. Students unions HS + college. */
export const LENS_TAGS: Record<AudienceLensId, readonly StakeholderTag[]> = {
  students: ["high_school_students", "college_students"],
  parents: ["parents"],
  counselors: ["career_counselors"],
  workforce: ["workforce_training_managers"],
};

export const HUMAN_CHANNELS = [
  "university",
  "community_college",
  "trade",
  "apprenticeship",
] as const;

export function tagLabel(tag: string): string {
  return tag in TAG_LABELS
    ? TAG_LABELS[tag as StakeholderTag]
    : tag.replaceAll("_", " ");
}

export function isAudienceLens(value: string): value is AudienceLensId {
  return (AUDIENCE_LENSES as readonly string[]).includes(value);
}

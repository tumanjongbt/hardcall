import type { Channel } from "./channels";
import { defaultPlaygroundForm, type PlaygroundForm } from "./playground";

export type PlaygroundSample = {
  id: string;
  name: string;
  form: PlaygroundForm;
};

/** Quick icon picks for the playground; the emoji field still accepts free text. */
export const EMOJI_PRESETS = [
  "📈",
  "🎓",
  "🏛️",
  "🔧",
  "🛠️",
  "📜",
  "🤖",
  "⚡",
] as const;

/**
 * Curated POST /api/events examples. One per channel, valid against the
 * public ingest contract (no source / external_id; tags from the stakeholder enum).
 */
export const PLAYGROUND_SAMPLES: readonly PlaygroundSample[] = [
  {
    id: "trade-overtime",
    name: "Trade overtime",
    form: {
      channel: "trade",
      title: "Electrician overtime wages rise 14% in Q3",
      description:
        "Journeyman electricians in several metro markets are seeing overtime premiums as construction backlogs stretch into fall.",
      emoji: "🔧",
      tags: ["high_school_students", "workforce_training_managers"],
    },
  },
  {
    id: "university-tuition",
    name: "University tuition",
    form: {
      channel: "university",
      title: "In-state CS tuition climbs faster than starting pay",
      description:
        "Four-year sticker price outpaced first-year computer science offers in several public university systems this cycle.",
      emoji: "🎓",
      tags: ["college_students", "parents"],
    },
  },
  {
    id: "apprenticeship-seats",
    name: "Apprenticeship seats",
    form: {
      channel: "apprenticeship",
      title: "IBEW apprenticeship seats open for the fall cohort",
      description:
        "Paid electrical apprenticeship seats just posted. Applications close in three weeks; counselors should flag seniors still exploring trades.",
      emoji: "🛠️",
      tags: ["high_school_students", "career_counselors"],
    },
  },
  {
    id: "community-college-cert",
    name: "Community college cert",
    form: {
      channel: "community_college",
      title: "HVAC certificate grads hired in under 60 days",
      description:
        "Regional community colleges report faster placement for one-year HVAC certificates versus adjacent general-ed tracks.",
      emoji: "📜",
      tags: ["college_students", "career_counselors"],
    },
  },
  {
    id: "automation-risk",
    name: "Automation risk",
    form: {
      channel: "automation",
      title: "Clerical roles face automation risk in back-office ops",
      description:
        "Routine document-processing roles show rising displacement pressure versus skilled trades that still need on-site judgment.",
      emoji: "🤖",
      tags: ["workforce_training_managers", "career_counselors"],
    },
  },
];

export function sampleCount(samples: readonly PlaygroundSample[] = PLAYGROUND_SAMPLES): number {
  return samples.length;
}

/** Clone a catalog entry so UI edits cannot mutate the source list. */
export function applySample(sample: PlaygroundSample): PlaygroundForm {
  return {
    channel: sample.form.channel,
    title: sample.form.title,
    description: sample.form.description,
    emoji: sample.form.emoji,
    tags: [...sample.form.tags],
  };
}

export function applySampleAt(
  index: number,
  samples: readonly PlaygroundSample[] = PLAYGROUND_SAMPLES
): PlaygroundForm | null {
  const sample = samples[index];
  return sample ? applySample(sample) : null;
}

/**
 * Next catalog index for Fill Sample.
 * No active sample (null / out of range) starts at 0; the last sample wraps.
 */
export function nextSampleIndex(
  current: number | null,
  count = PLAYGROUND_SAMPLES.length
): number {
  if (count <= 0) return 0;
  if (current === null || !Number.isInteger(current) || current < 0 || current >= count) {
    return 0;
  }
  return (current + 1) % count;
}

export function cycleSample(
  current: number | null,
  samples: readonly PlaygroundSample[] = PLAYGROUND_SAMPLES
): { index: number; sample: PlaygroundSample; form: PlaygroundForm } {
  const index = nextSampleIndex(current, samples.length);
  const sample = samples[index];
  if (!sample) {
    return {
      index: 0,
      sample: samples[0] ?? {
        id: "empty",
        name: "Empty",
        form: defaultPlaygroundForm(),
      },
      form: defaultPlaygroundForm(),
    };
  }
  return { index, sample, form: applySample(sample) };
}

export function resetPlaygroundForm(): PlaygroundForm {
  return defaultPlaygroundForm();
}

export function sampleStatusLabel(
  index: number | null,
  samples: readonly PlaygroundSample[] = PLAYGROUND_SAMPLES
): string | null {
  if (index === null) return null;
  const sample = samples[index];
  if (!sample) return null;
  return `Sample ${index + 1}/${samples.length}: ${sample.name}`;
}

export function sampleChannels(
  samples: readonly PlaygroundSample[] = PLAYGROUND_SAMPLES
): Channel[] {
  return samples.map((sample) => sample.form.channel);
}

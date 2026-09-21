import { createApp } from "./app";
import type { CreateEvent, CreateInsight, EventRow, InsightRow, Store } from "./types";

const FIXTURES: CreateEvent[] = [
  {
    channel: "university",
    title: "CS starting salaries up in metro X",
    description: "Bachelor's ROI still holds in software for this metro.",
    emoji: "📈",
    tags: ["college_students", "parents"],
  },
  {
    channel: "community_college",
    title: "Two-year nursing pathway fills in one week",
    description: "Waitlist opened after clinical seats filled.",
    emoji: "🏥",
    tags: ["high_school_students", "career_counselors"],
  },
  {
    channel: "trade",
    title: "Welding night program — open seats",
    description: "Evening cohort for working adults. Tools provided.",
    emoji: "🔧",
    tags: ["high_school_students", "workforce_training_managers"],
  },
  {
    channel: "apprenticeship",
    title: "IBEW year-1 electrical apprenticeship",
    description: "Paid related instruction plus job placement.",
    emoji: "⚡",
    tags: ["high_school_students", "parents"],
  },
  {
    channel: "automation",
    title: "Routine claims coding is automating faster",
    description: "Entry billing roles shrinking; exception handling still hires.",
    emoji: "🤖",
    tags: ["college_students", "career_counselors"],
  },
  {
    channel: "trade",
    title: "HVAC demand across the valley",
    description: "Heat-pump retrofits need licensed techs this quarter.",
    emoji: "❄️",
    tags: ["parents", "workforce_training_managers"],
  },
];

const INSIGHT_FIXTURES: CreateInsight[] = [
  { title: "Top Trade Income Growth", value: "+18%" },
  { title: "Apprenticeship Placement Rate", value: "91%" },
  { title: "University 4-year ROI", value: "+6%" },
  { title: "Automation Displacement Risk", value: "−12%" },
];

function createMemoryStore(
  seed: EventRow[] = [],
  insightSeed: InsightRow[] = []
): Store {
  const rows = [...seed];
  const insights = [...insightSeed];
  return {
    async insertEvent(value) {
      const row: EventRow = {
        id: crypto.randomUUID(),
        ...value,
        created_at: new Date().toISOString(),
      };
      rows.unshift(row);
      return row;
    },
    async listEvents({ limit, channel }) {
      return rows
        .filter((row) => !channel || row.channel === channel)
        .sort((a, b) => {
          const byTime = b.created_at.localeCompare(a.created_at);
          return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
        })
        .slice(0, limit);
    },
    async upsertInsight(value) {
      const existing = insights.find((row) => row.title === value.title);
      const now = new Date().toISOString();
      if (existing) {
        existing.value = value.value;
        existing.updated_at = now;
        return { row: { ...existing }, created: false };
      }
      const row: InsightRow = {
        id: crypto.randomUUID(),
        title: value.title,
        value: value.value,
        created_at: now,
        updated_at: now,
      };
      insights.unshift(row);
      return { row, created: true };
    },
    async listInsights() {
      return [...insights].sort((a, b) => {
        const byTime = b.updated_at.localeCompare(a.updated_at);
        return byTime !== 0 ? byTime : a.title.localeCompare(b.title);
      });
    },
  };
}

function seedRows(): EventRow[] {
  const start = Date.parse("2026-09-01T12:00:00.000Z");
  const extras: EventRow[] = [];
  const channels = [
    "university",
    "community_college",
    "trade",
    "apprenticeship",
    "automation",
  ] as const;
  for (let i = 0; i < 70; i += 1) {
    const channel = channels[i % channels.length];
    extras.push({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      channel,
      title: `Seed signal ${i + 1}: ${channel.replaceAll("_", " ")}`,
      description: i % 3 === 0 ? `Fixture description ${i + 1}` : null,
      emoji: i % 4 === 0 ? "✨" : null,
      tags: i % 2 === 0 ? ["parents"] : ["career_counselors"],
      created_at: new Date(start + i * 3_600_000).toISOString(),
    });
  }
  const fixtures: EventRow[] = FIXTURES.map((value, i) => ({
    id: `11111111-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    ...value,
    created_at: new Date(start + (80 + i) * 3_600_000).toISOString(),
  }));
  return [...extras, ...fixtures];
}

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
function seedInsights(): InsightRow[] {
  const start = Date.parse("2026-09-21T08:00:00.000Z");
  return INSIGHT_FIXTURES.map((value, i) => ({
    id: `22222222-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    title: value.title,
    value: value.value,
    created_at: new Date(start).toISOString(),
    updated_at: new Date(start + i * 60_000).toISOString(),
  }));
}

const app = createApp(createMemoryStore(seedRows(), seedInsights()), { logger: true });

app.listen({ port, host }).then(
  () => {
    console.log(`memory API listening on http://${host}:${port}`);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

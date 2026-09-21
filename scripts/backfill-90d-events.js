#!/usr/bin/env node
/**
 * 90-day synthetic hist backfill into `events` (no DDL, no forecast_snapshots,
 * no geo, no wage tables).
 *
 * POST /api/events rejects `created_at` (`unknown_key`). The server INSERT
 * lists only channel/title/description/emoji/tags; `created_at` is
 * DEFAULT now(). Posting through the public API would stamp every row
 * "today" and fake a dense history. This script does not do that.
 *
 *   node scripts/backfill-90d-events.js
 *     prints one-off SQL (DELETE + INSERT with explicit created_at)
 *
 *   EVENTS_API_URL=https://hardcall-api.onrender.com node scripts/backfill-90d-events.js --probe
 *     confirms the API rejects created_at, then prints the same SQL
 *
 * Paste the SQL in the Supabase editor (Render free cannot run release
 * migrate — same as 003). Charts stay honest if you skip this: empty days
 * stay empty and the naive band is wide. `npm run dev:memory` already
 * spreads fixtures across 90 days without touching production.
 */

const API = (process.env.EVENTS_API_URL || "").replace(/\/+$/, "");
const DAYS = 90;
const PREFIX = "[90d-backfill]";
const CHANNELS = [
  "university",
  "community_college",
  "trade",
  "apprenticeship",
  "automation",
];
const TAGS = [
  ["college_students"],
  ["high_school_students"],
  ["parents"],
  ["career_counselors"],
  ["workforce_training_managers"],
  ["high_school_students", "parents"],
  ["college_students", "career_counselors"],
];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTags(tags) {
  return `ARRAY[${tags.map(sqlString).join(", ")}]::stakeholder_tag[]`;
}

function sqlCreatedAt(dayOffset, hour) {
  return `(date_trunc('day', timezone('utc', now())) - interval '${dayOffset} days' + interval '${hour} hours') AT TIME ZONE 'utc'`;
}

function rows() {
  const out = [];
  for (let i = 0; i < DAYS; i += 1) {
    const channel = CHANNELS[i % CHANNELS.length];
    const tags = TAGS[i % TAGS.length];
    const hour = 8 + (i % 9);
    out.push({
      channel,
      title: `${PREFIX} day ${String(DAYS - i).padStart(2, "0")} ${channel.replaceAll("_", " ")} signal`,
      description: "Synthetic hist for Charts. Not a wage or ROI guarantee.",
      emoji: i % 5 === 0 ? "✨" : null,
      tags,
      dayOffset: DAYS - 1 - i,
      hour,
    });
  }
  return out;
}

function renderSql() {
  const values = rows()
    .map((row) => {
      const emoji = row.emoji === null ? "NULL" : sqlString(row.emoji);
      return `  (${sqlString(row.channel)}::event_channel, ${sqlString(row.title)}, ${sqlString(row.description)}, ${emoji}, ${sqlTags(row.tags)}, ${sqlCreatedAt(row.dayOffset, row.hour)})`;
    })
    .join(",\n");
  return `-- 90-day synthetic hist into events. No DDL. No forecast_snapshots.
-- created_at is server-side on POST /api/events; this SQL is the admin path.
-- Re-run safe: deletes only titles prefixed ${PREFIX}.

DELETE FROM events WHERE title LIKE '${PREFIX}%';

INSERT INTO events (channel, title, description, emoji, tags, created_at)
VALUES
${values};
`;
}

async function probeApi(base) {
  const res = await fetch(`${base}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: "trade",
      title: `${PREFIX} probe (should 400)`,
      created_at: "2026-06-24T08:00:00.000Z",
    }),
  });
  const raw = await res.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed ?? raw };
}

async function main() {
  const probe = process.argv.includes("--probe");
  if (probe) {
    if (!API) {
      console.error("EVENTS_API_URL is required for --probe");
      process.exit(2);
    }
    const result = await probeApi(API);
    const details = result.body && typeof result.body === "object" ? result.body.details : null;
    const createdAtRejected =
      result.status >= 400 &&
      Array.isArray(details) &&
      details.some((row) => row && row.field === "created_at");
    if (createdAtRejected) {
      console.error(
        `probe: HTTP ${result.status} — created_at is server-side only (unknown_key). Not posting now()-stamped fakes.`
      );
    } else {
      console.error(
        `probe: HTTP ${result.status}. Refusing to POST hist rows; timestamps would be now(). Use the SQL below.`
      );
      console.error(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
    }
  } else {
    console.error(
      "POST /api/events cannot set created_at (DEFAULT now()). Honest empty hist stays empty unless you run this SQL as admin."
    );
  }
  process.stdout.write(renderSql());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

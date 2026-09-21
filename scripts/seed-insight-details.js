#!/usr/bin/env node
/**
 * After Bernard pastes migrations/004_event_provenance.sql (and 003 if needed)
 * in the Supabase SQL editor (Render free cannot run release migrate), POST
 * analysis bodies for the eight seeded KPI titles with source: "synthetic".
 * Exact-title upsert: value is reused from GET /api/insights when present
 * so we do not wipe KPIs.
 *
 *   EVENTS_API_URL=https://hardcall-api.onrender.com node scripts/seed-insight-details.js
 *
 * Example one-off (same titles):
 *
 *   curl -sS -X POST "$EVENTS_API_URL/api/insight" \
 *     -H 'Content-Type: application/json' \
 *     -d '{"title":"Top Trade Income Growth","value":"+19%","detail":"...","source":"synthetic"}'
 */

const API = (process.env.EVENTS_API_URL || "https://hardcall-api.onrender.com").replace(
  /\/+$/,
  ""
);

/** @type {Record<string, { value: string, detail: string }>} */
const SEEDS = {
  "Top Trade Income Growth": {
    value: "+19%",
    detail:
      "Licensed electricians and HVAC techs are still the fastest wage growers in this market.\n\nCounselors: treat this as a waitlist problem, not a demand problem. Night cohorts plus paid helper hours keep students earning while they finish related instruction. Compare net cost and months-to-license against a four-year sticker — the income curve usually wins for students who want a tool-in-hand path.",
  },
  "Highest Tuition Payload": {
    value: "Traditional 4-Year University",
    detail:
      "Traditional four-year sticker remains the heaviest education payload.\n\nAsk families for net price, not the brochure number. Stack grants, community-college gen-ed, and employer tuition before they lock a high-cost major with a soft labor market. A bachelor's is still the right call for some orbits — just price the payload first.",
  },
  "AI Automation High-Risk Sector": {
    value: "Clerical / Call Centers",
    detail:
      "Clerical and call-center work is the loudest automation-risk sector in the current signal set.\n\nEntry roles that only route, transcribe, or script-answer are shrinking. Adjacent work that still hires: exception handling, quality review, and customer recovery. Point students toward those skills or toward trades and care roles that are harder to automate.",
  },
  "Best Short-Path ROI": {
    value: "Community College + Cert Stack",
    detail:
      "Community college plus a targeted cert stack is the best short-path ROI on the board.\n\nTwo-year nursing, HVAC, welding, and IT support certs still convert faster than a generic bachelor's. Build a 12–24 month plan: prerequisite term, cohort seat, then employer-recognized cert. Counselors should keep a list of programs that filled last cycle — those waitlists are a signal, not a warning to walk away.",
  },
  "Apprenticeship Wage Trajectory": {
    value: "+12% YoY journey conversion",
    detail:
      "Journey conversion is paying a real wage trajectory — about +12% year over year in the latest refresh.\n\nYear-1 electrical and other registered apprenticeships combine paid related instruction with placement. The call to make: can the student show up on time for four years? If yes, the income path usually beats an unfocused degree. If not, a shorter trade cert may be the better first orbit.",
  },
  "University CS Starting Median": {
    value: "$78k",
    detail:
      "CS starting median is still a strong number here ($78k), but it is no longer an automatic launch.\n\nInternships, a shipped project, and location still decide who gets the offer. Students who only collect credits are competing with automation-assisted junior work. Pair the degree with a portfolio and a backup short-path cert if internships do not land by junior year.",
  },
  "Trade Overtime Demand": {
    value: "Electricians / HVAC elevated",
    detail:
      "Overtime demand is elevated for electricians and HVAC — heat-pump retrofits and service calls are the current pull.\n\nThis is a staffing signal, not just a wage headline. Licensed techs can often choose hours; helpers and first-year apprentices get the leftover night work. Counselors: match stamina and schedule reality, then get the student on a waitlist before the next cohort fills.",
  },
  "Automation Displacement Signal": {
    value: "Warehouse pick-pack rising",
    detail:
      "Warehouse pick-pack displacement is the rising automation signal.\n\nGoods-to-person systems and scan-heavy roles are the first to compress. Students already in those jobs should add maintenance, inventory exception, or CDL/logistics skills — the building still needs people who can fix the line. Do not treat every warehouse job as doomed; treat pick-pack-only as the risky slice.",
  },
};

async function main() {
  const demoFlag = String(process.env.HARDCALL_ALLOW_DEMO ?? "").trim().toLowerCase();
  const demoOff =
    demoFlag === "false" ||
    demoFlag === "0" ||
    demoFlag === "off" ||
    demoFlag === "no" ||
    (demoFlag === "" && process.env.NODE_ENV === "production");
  if (demoOff) {
    console.error(
      "Refusing synthetic KPI seed: HARDCALL_ALLOW_DEMO is off. Use npm run ingest for live Scorecard/BLS/O*NET/apprenticeship rows."
    );
    process.exit(1);
  }
  const res = await fetch(`${API}/api/insights`);
  if (!res.ok) {
    throw new Error(`GET /api/insights failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  const current = new Map(
    (Array.isArray(body.insights) ? body.insights : []).map((row) => [row.title, row])
  );

  for (const [title, seed] of Object.entries(SEEDS)) {
    const existing = current.get(title);
    const value = existing?.value || seed.value;
    const payload = { title, value, detail: seed.detail, source: "synthetic" };
    const posted = await fetch(`${API}/api/insight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const row = await posted.json();
    if (!posted.ok) {
      console.error(title, posted.status, row);
      process.exitCode = 1;
      continue;
    }
    console.log(`${posted.status} ${title} → ${row.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

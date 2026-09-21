import { createHash } from "node:crypto";
import { cell, parseCsv, parseNumber } from "../csv";

export type Provenance = {
  source: "apprenticeship_gov";
  source_url: string;
  fetched_at: string;
};

export type SponsorRecord = {
  sponsor_key: string;
  name: string;
  organization_type: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  registered_at: string | null;
} & Provenance;

export function sponsorKey(
  name: string,
  address: string,
  city: string,
  state: string
): string {
  const raw = [name, address, city, state]
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function present(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseRegistered(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Parse DOL OA Partner Sponsors CSV. Drops contact/email/phone (PII). */
export function parseApprenticeshipSponsors(
  csvText: string,
  provenance: Omit<Provenance, "source">,
  opts?: { limit?: number }
): SponsorRecord[] {
  const rows = parseCsv(csvText);
  const out: SponsorRecord[] = [];
  const seen = new Set<string>();
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  for (const row of rows) {
    const name = cell(row, "ORGANIZATION NAME");
    if (!name) continue;
    const address = cell(row, "ADDRESS");
    const city = cell(row, "CITY");
    const state = (cell(row, "STATE") || "").toUpperCase();
    const key = sponsorKey(name, address, city, state);
    if (seen.has(key)) continue;
    seen.add(key);
    const website = present(cell(row, "ORGANIZATION URL"));
    out.push({
      sponsor_key: key,
      name,
      organization_type: present(cell(row, "ORGANIZATION TYPE")),
      website,
      city: present(city),
      state: present(state),
      zip: present(cell(row, "ZIP")),
      county: present(cell(row, "COUNTY")),
      registered_at: parseRegistered(cell(row, "REGISTERED DATE")),
      source: "apprenticeship_gov",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function apprenticeshipStateCounts(
  rows: Array<{ state: string | null }>
): Array<{ state: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const state = (row.state ?? "").trim().toUpperCase();
    if (!state || state.length !== 2) continue;
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export function parseApprenticeshipNumber(raw: string): number | null {
  return parseNumber(raw);
}

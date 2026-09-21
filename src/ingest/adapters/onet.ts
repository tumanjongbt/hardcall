import { cell, parseCsv, parseNumber } from "../csv";

export type OnetProvenance = {
  source: "onet";
  source_url: string;
  fetched_at: string;
};

export type OccupationRecord = {
  onet_soc: string;
  title: string;
  description: string | null;
} & OnetProvenance;

export function parseOnetOccupations(
  csvText: string,
  provenance: Omit<OnetProvenance, "source">,
  opts?: { limit?: number }
): OccupationRecord[] {
  const rows = parseCsv(csvText);
  const out: OccupationRecord[] = [];
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  const seen = new Set<string>();
  for (const row of rows) {
    const onet_soc = cell(row, "O*NET-SOC Code", "ONET-SOC Code", "O*NET-SOC");
    const title = cell(row, "Title");
    if (!onet_soc || !title) continue;
    if (seen.has(onet_soc)) continue;
    seen.add(onet_soc);
    const description = cell(row, "Description");
    out.push({
      onet_soc,
      title,
      description: description ? description : null,
      source: "onet",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

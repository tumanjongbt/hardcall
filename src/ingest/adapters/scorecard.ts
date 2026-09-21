import { cell, parseCsv, parseNumber } from "../csv";

export type ScorecardProvenance = {
  source: "scorecard";
  source_url: string;
  fetched_at: string;
};

export type InstitutionRecord = {
  unitid: string;
  name: string;
  city: string | null;
  state: string | null;
  control: string | null;
  operating: boolean;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  net_price: number | null;
  median_earnings: number | null;
} & ScorecardProvenance;

export type ProgramRecord = {
  institution_unitid: string;
  institution_name: string | null;
  cip_code: string;
  cip_title: string | null;
  credential_level: string;
  credential_title: string | null;
  median_earnings: number | null;
  median_debt: number | null;
} & ScorecardProvenance;

const CONTROL: Record<string, string> = {
  "1": "public",
  "2": "private_nonprofit",
  "3": "private_for_profit",
};

function present(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function netPrice(row: Record<string, string>): number | null {
  return (
    parseNumber(cell(row, "NPT4_PUB")) ??
    parseNumber(cell(row, "NPT4_PRIV")) ??
    parseNumber(cell(row, "NPT4_PROG")) ??
    parseNumber(cell(row, "NPT4_OTHER"))
  );
}

export function parseScorecardInstitutions(
  csvText: string,
  provenance: Omit<ScorecardProvenance, "source">,
  opts?: { limit?: number; operatingOnly?: boolean }
): InstitutionRecord[] {
  const rows = parseCsv(csvText, ",", [
    "UNITID",
    "INSTNM",
    "CITY",
    "STABBR",
    "CONTROL",
    "CURROPER",
    "TUITIONFEE_IN",
    "TUITIONFEE_OUT",
    "NPT4_PUB",
    "NPT4_PRIV",
    "NPT4_PROG",
    "NPT4_OTHER",
    "MD_EARN_WNE_P10",
  ]);
  const out: InstitutionRecord[] = [];
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  const operatingOnly = opts?.operatingOnly !== false;
  for (const row of rows) {
    const unitid = cell(row, "UNITID");
    const name = cell(row, "INSTNM");
    if (!unitid || !name) continue;
    const operating = cell(row, "CURROPER") === "1";
    if (operatingOnly && !operating) continue;
    out.push({
      unitid,
      name,
      city: present(cell(row, "CITY")),
      state: present(cell(row, "STABBR"))?.toUpperCase() ?? null,
      control: CONTROL[cell(row, "CONTROL")] ?? present(cell(row, "CONTROL")),
      operating,
      tuition_in_state: parseNumber(cell(row, "TUITIONFEE_IN")),
      tuition_out_state: parseNumber(cell(row, "TUITIONFEE_OUT")),
      net_price: netPrice(row),
      median_earnings: parseNumber(cell(row, "MD_EARN_WNE_P10")),
      source: "scorecard",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseScorecardPrograms(
  csvText: string,
  provenance: Omit<ScorecardProvenance, "source">,
  opts?: { limit?: number }
): ProgramRecord[] {
  const rows = parseCsv(csvText, ",", [
    "UNITID",
    "INSTNM",
    "CIPCODE",
    "CIPDESC",
    "CREDLEV",
    "CREDDESC",
    "EARN_MDN_HI_1YR",
    "DEBT_ALL_STGP_ANY_MDN",
    "DEBT_ALL_STGP_EVAL_MDN",
  ]);
  const out: ProgramRecord[] = [];
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  for (const row of rows) {
    const unitid = cell(row, "UNITID");
    const cip = cell(row, "CIPCODE");
    if (!unitid || !cip) continue;
    out.push({
      institution_unitid: unitid,
      institution_name: present(cell(row, "INSTNM")),
      cip_code: cip,
      cip_title: present(cell(row, "CIPDESC")),
      credential_level: cell(row, "CREDLEV") || "",
      credential_title: present(cell(row, "CREDDESC")),
      median_earnings: parseNumber(cell(row, "EARN_MDN_HI_1YR")),
      median_debt: parseNumber(cell(row, "DEBT_ALL_STGP_ANY_MDN", "DEBT_ALL_STGP_EVAL_MDN")),
      source: "scorecard",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function median(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 0) {
    return (nums[mid - 1] + nums[mid]) / 2;
  }
  return nums[mid];
}

import { parseCsvRows, parseNumber } from "../csv";
import { readXlsxSheets } from "../xlsx";

export type EpProvenance = {
  source_url: string;
  fetched_at: string;
};

export type ProjectionRecord = {
  soc_code: string | null;
  occupation_title: string;
  occupation_type: "line" | "summary" | null;
  period: string;
  /** Persons. Official Table 1.2 publishes employment in thousands; that scale is applied here. */
  employment_base: number | null;
  employment_proj: number | null;
  change_percent: number | null;
  /** Persons. Not a projections-table column; carried for insights/events. */
  annual_openings: number | null;
  /** Dollars, published median. Not a projections-table column. */
  median_annual_wage: number | null;
  typical_education: string | null;
  source: "bls_ep";
  source_url: string;
  fetched_at: string;
};

type RawRow = {
  title: string;
  soc_code: string | null;
  occupation_type: "line" | "summary" | null;
  employment_base: number | null;
  employment_proj: number | null;
  change_percent: number | null;
  annual_openings: number | null;
  median_annual_wage: number | null;
  typical_education: string | null;
};

function normHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function epNumber(raw: string): number | null {
  const trimmed = raw.replace(/\[.*?\]/g, "").replace(/[—–]/g, "").trim();
  if (!trimmed || trimmed === "-" || trimmed === "–") return null;
  return parseNumber(trimmed);
}

function educationText(raw: string): string | null {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed === "—" || trimmed === "–" || trimmed === "-" || trimmed === "NA") return null;
  return trimmed;
}

function occupationType(raw: string): "line" | "summary" | null {
  const lower = raw.toLowerCase();
  if (lower.includes("line")) return "line";
  if (lower.includes("summary")) return "summary";
  return null;
}

function headerIndex(headers: string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(normHeader(header)));
}

function findHeaderRow(grid: string[][]): number {
  const limit = Math.min(grid.length, 20);
  for (let i = 0; i < limit; i += 1) {
    const joined = normHeader((grid[i] ?? []).join(" "));
    if (
      joined.includes("matrix title") ||
      joined.includes("occupation type") ||
      (joined.includes("employment") && joined.includes("percent") && joined.includes("opening"))
    ) {
      return i;
    }
  }
  return 0;
}

function yearsFromHeaders(headers: string[]): { base: string; proj: string } | null {
  const years: string[] = [];
  for (const header of headers) {
    const match = normHeader(header).match(/employment,\s*(\d{4})\b/);
    if (match?.[1] && !normHeader(header).includes("change") && !normHeader(header).includes("distribution")) {
      years.push(match[1]);
    }
  }
  if (years.length >= 2) return { base: years[0] ?? "", proj: years[1] ?? "" };
  const span = headers.join(" ").match(/(20\d{2})\s*[–-]\s*(20\d{2}|(\d{2}))/);
  if (span?.[1] && span[2]) {
    const proj = span[2].length === 2 ? `${span[1].slice(0, 2)}${span[2]}` : span[2];
    return { base: span[1], proj };
  }
  return null;
}

/**
 * Employment in Table 1.2 is published in thousands. A national total under 1,000,000
 * is that scale (persons would be ~1.7e8). Person-count files are left as published.
 */
export function employmentScale(preamble: string, rows: RawRow[]): number {
  if (/employment in thousands/i.test(preamble)) return 1000;
  const total = rows.find((row) => /^total,\s*all occupations$/i.test(row.title));
  if (total?.employment_base != null && total.employment_base < 1_000_000) return 1000;
  return 1;
}

function scaleCount(value: number | null, scale: number): number | null {
  if (value == null) return null;
  return Math.round(value * scale);
}

function gridToRecords(
  grid: string[][],
  preamble: string,
  provenance: EpProvenance,
  opts?: { limit?: number; period?: string }
): ProjectionRecord[] {
  if (grid.length === 0) return [];
  const headerAt = findHeaderRow(grid);
  const headers = grid[headerAt] ?? [];
  const years = yearsFromHeaders(headers);
  const period = opts?.period ?? (years ? `${years.base}-${years.proj}` : "2024-2034");
  const titleIdx = headerIndex(headers, /matrix title|occupation title|^title$/);
  const codeIdx = headerIndex(headers, /matrix code|occupation code|soc code|^soc$/);
  const typeIdx = headerIndex(headers, /occupation type/);
  const changePctIdx = headerIndex(headers, /employment change, percent|percent change/);
  const openingsIdx = headerIndex(headers, /occupational openings/);
  const wageIdx = headerIndex(headers, /median annual wage/);
  const eduIdx = headerIndex(headers, /typical education/);
  const empIdxs = headers
    .map((header, index) => ({ header: normHeader(header), index }))
    .filter(
      (item) =>
        /^employment, \d{4}$/.test(item.header) ||
        /^employment \d{4}$/.test(item.header)
    );
  const baseIdx = empIdxs[0]?.index ?? -1;
  const projIdx = empIdxs[1]?.index ?? -1;
  if (titleIdx < 0) return [];

  const raw: RawRow[] = [];
  for (const row of grid.slice(headerAt + 1)) {
    const title = (row[titleIdx] ?? "").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
    if (!title || /^occupation/i.test(title)) continue;
    raw.push({
      title,
      soc_code: codeIdx >= 0 ? (row[codeIdx] ?? "").trim() || null : null,
      occupation_type: typeIdx >= 0 ? occupationType(row[typeIdx] ?? "") : null,
      employment_base: baseIdx >= 0 ? epNumber(row[baseIdx] ?? "") : null,
      employment_proj: projIdx >= 0 ? epNumber(row[projIdx] ?? "") : null,
      change_percent: changePctIdx >= 0 ? epNumber(row[changePctIdx] ?? "") : null,
      annual_openings: openingsIdx >= 0 ? epNumber(row[openingsIdx] ?? "") : null,
      median_annual_wage: wageIdx >= 0 ? epNumber(row[wageIdx] ?? "") : null,
      typical_education: eduIdx >= 0 ? educationText(row[eduIdx] ?? "") : null,
    });
  }

  const scale = employmentScale(preamble, raw);
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  const out: ProjectionRecord[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const key = `${row.title.toLowerCase()}|${period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      soc_code: row.soc_code,
      occupation_title: row.title,
      occupation_type: row.occupation_type,
      period,
      employment_base: scaleCount(row.employment_base, scale),
      employment_proj: scaleCount(row.employment_proj, scale),
      change_percent: row.change_percent,
      annual_openings: scaleCount(row.annual_openings, scale),
      median_annual_wage: row.median_annual_wage,
      typical_education: row.typical_education,
      source: "bls_ep",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseHtmlTables(html: string): string[][][] {
  const tables: string[][][] = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(html))) {
    const rows: string[][] = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tableMatch[1] ?? ""))) {
      const cells: string[] = [];
      const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(rowMatch[1] ?? ""))) {
        const text = (cellMatch[1] ?? "")
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&#8211;|&ndash;/gi, "–")
          .replace(/&#8212;|&mdash;/gi, "—")
          .replace(/&amp;/gi, "&")
          .replace(/\s+/g, " ")
          .trim();
        cells.push(text);
      }
      if (cells.some((cell) => cell.length > 0)) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

function pickEpGrid(tables: string[][][]): string[][] {
  let best: string[][] = [];
  for (const table of tables) {
    const headerAt = findHeaderRow(table);
    const joined = normHeader((table[headerAt] ?? []).join(" "));
    if (joined.includes("matrix title") || joined.includes("occupation type")) return table;
    if (table.length > best.length) best = table;
  }
  return best;
}

/** CSV, TSV, or HTML Table 1.2. Numbers stay official; thousands scale is explicit. */
export function parseEpTable(
  text: string,
  provenance: EpProvenance,
  opts?: { limit?: number; period?: string }
): ProjectionRecord[] {
  if (/<table[\s>]/i.test(text) || /<html[\s>]/i.test(text)) {
    return gridToRecords(pickEpGrid(parseHtmlTables(text)), text, provenance, opts);
  }
  const delimiter = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  return gridToRecords(parseCsvRows(text, delimiter), text, provenance, opts);
}

export async function parseEpXlsx(
  buffer: Buffer,
  provenance: EpProvenance,
  opts?: { limit?: number; period?: string }
): Promise<ProjectionRecord[]> {
  const sheets = await readXlsxSheets(buffer);
  const ranked = [...sheets].sort((a, b) => {
    const score = (name: string) =>
      /1\.2|characteristic|projection/i.test(name) ? 0 : 1;
    return score(a.name) - score(b.name);
  });
  for (const sheet of ranked) {
    const preamble = sheet.rows
      .slice(0, 8)
      .map((row) => row.join(" "))
      .join("\n");
    const rows = gridToRecords(sheet.rows, preamble, provenance, opts);
    if (rows.length > 0) return rows;
  }
  return [];
}

export function isDetailedOccupation(row: ProjectionRecord): boolean {
  if (/^total,\s*all occupations$/i.test(row.occupation_title)) return false;
  if (row.occupation_type === "summary") return false;
  if (row.occupation_type === "line") return true;
  if (row.soc_code) {
    const digits = row.soc_code.replace(/-/g, "");
    return !digits.endsWith("0000") && digits !== "000000";
  }
  return row.occupation_type == null;
}

export function fastestChanging(
  rows: ProjectionRecord[],
  direction: "grow" | "decline"
): ProjectionRecord | null {
  const detailed = rows.filter(
    (row) => isDetailedOccupation(row) && row.change_percent != null
  );
  detailed.sort((a, b) => {
    const delta = (b.change_percent ?? 0) - (a.change_percent ?? 0);
    return direction === "grow" ? delta : -delta;
  });
  return detailed[0] ?? null;
}

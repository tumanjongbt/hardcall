/** RFC4180-ish CSV/TSV parser. Handles quoted commas and doubled quotes. */

export function parseCsv(
  text: string,
  delimiter = ",",
  keep?: string[]
): Record<string, string>[] {
  const rows = parseCsvRows(text, delimiter);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const keepSet = keep && keep.length > 0 ? new Set(keep.map((name) => name.toLowerCase())) : null;
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (cells.length === 1 && cells[0] === "") continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c] ?? `col_${c}`;
      if (keepSet && !keepSet.has(header.toLowerCase())) continue;
      rec[header] = cells[c] ?? "";
    }
    out.push(rec);
  }
  return out;
}

export function parseCsvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");
  while (i < input.length) {
    const ch = input[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (inQuotes || cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

export function cell(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && row[name] != null) {
      return String(row[name]).trim();
    }
    const found = Object.keys(row).find(
      (key) => key.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (found) return String(row[found] ?? "").trim();
  }
  return "";
}

export function parseNumber(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (
    upper === "NA" ||
    upper === "NULL" ||
    upper === "PRIVACYSUPPRESSED" ||
    upper === "PS" ||
    upper === "N/A" ||
    upper === "-" ||
    trimmed === "(2)" ||
    trimmed === "(²)" ||
    trimmed === "(1)"
  ) {
    return null;
  }
  const n = Number(trimmed.replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
}

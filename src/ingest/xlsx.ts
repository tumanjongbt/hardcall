import yauzl from "yauzl";

export type SheetGrid = { name: string; rows: string[][] };

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(err ?? new Error("zip_open_failed"));
        return;
      }
      resolve(zip);
    });
  });
}

function nextEntry(zip: yauzl.ZipFile): Promise<yauzl.Entry | null> {
  return new Promise((resolve, reject) => {
    const onEntry = (entry: yauzl.Entry) => {
      cleanup();
      resolve(entry);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      zip.off("entry", onEntry);
      zip.off("end", onEnd);
      zip.off("error", onError);
    };
    zip.once("entry", onEntry);
    zip.once("end", onEnd);
    zip.once("error", onError);
    zip.readEntry();
  });
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error("zip_entry_stream_failed"));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function textsIn(xml: string): string[] {
  const out: string[] = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out.push(decodeEntities(match[1] ?? ""));
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out.push(textsIn(match[1] ?? "").join(""));
  return out;
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0] ?? "";
  if (!letters) return 0;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>/]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    const rowXml = rowMatch[1] ?? "";
    while ((cellMatch = cellRe.exec(rowXml))) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = /r="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const idx = ref ? colIndex(ref) : cells.length;
      let value = "";
      if (type === "s") {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        value = shared[Number(raw)] ?? "";
      } else if (type === "inlineStr") {
        value = textsIn(body).join("");
      } else {
        value = decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }
      while (cells.length < idx) cells.push("");
      cells[idx] = value.replace(/\s+/g, " ").trim();
    }
    if (cells.some((cell) => cell.length > 0)) rows.push(cells);
  }
  return rows;
}

function attr(tag: string, name: string): string {
  const match = new RegExp(`${name}="([^"]*)"`, "i").exec(tag);
  return match?.[1] ?? "";
}

/** Read worksheet grids from an xlsx buffer. Official EP workbooks are xlsx. */
export async function readXlsxSheets(buffer: Buffer): Promise<SheetGrid[]> {
  const zip = await openZip(buffer);
  const files = new Map<string, string>();
  try {
    for (;;) {
      const entry = await nextEntry(zip);
      if (!entry) break;
      const name = entry.fileName.replace(/\\/g, "/");
      const lower = name.toLowerCase();
      const keep =
        lower.endsWith("xl/workbook.xml") ||
        lower.endsWith("xl/_rels/workbook.xml.rels") ||
        lower.endsWith("xl/sharedstrings.xml") ||
        /xl\/worksheets\/sheet\d+\.xml$/i.test(lower);
      if (!keep) continue;
      const buf = await readEntry(zip, entry);
      files.set(lower, buf.toString("utf8"));
    }
  } finally {
    zip.close();
  }

  const workbook = [...files.entries()].find(([name]) => name.endsWith("xl/workbook.xml"))?.[1];
  if (!workbook) throw new Error("xlsx_workbook_missing");
  const rels =
    [...files.entries()].find(([name]) => name.endsWith("xl/_rels/workbook.xml.rels"))?.[1] ?? "";
  const shared =
    [...files.entries()].find(([name]) => name.endsWith("xl/sharedstrings.xml"))?.[1] ?? "";
  const sharedStrings = shared ? parseSharedStrings(shared) : [];

  const targets = new Map<string, string>();
  const relRe = /<Relationship\b([^>]*)\/?>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRe.exec(rels))) {
    const id = attr(relMatch[1] ?? "", "Id");
    const target = attr(relMatch[1] ?? "", "Target").replace(/\\/g, "/");
    if (id && target) targets.set(id, target.replace(/^\//, "").replace(/^xl\//, ""));
  }

  const sheets: SheetGrid[] = [];
  const sheetRe = /<sheet\b([^>]*)\/?>/g;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetRe.exec(workbook))) {
    const tag = sheetMatch[1] ?? "";
    const name = attr(tag, "name") || "sheet";
    const rid = attr(tag, "r:id") || attr(tag, "id");
    const target = targets.get(rid) ?? "";
    const xml =
      files.get(`xl/${target}`.toLowerCase()) ??
      [...files.entries()].find(([path]) => target && path.endsWith(target.toLowerCase()))?.[1];
    if (!xml) continue;
    sheets.push({ name, rows: parseSheet(xml, sharedStrings) });
  }
  if (sheets.length === 0) {
    for (const [path, xml] of files) {
      if (!/worksheets\/sheet\d+\.xml$/i.test(path)) continue;
      sheets.push({ name: path, rows: parseSheet(xml, sharedStrings) });
    }
  }
  return sheets;
}

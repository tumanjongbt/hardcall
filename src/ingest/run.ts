import { readFile } from "node:fs/promises";
import { parseApprenticeshipSponsors, type SponsorRecord } from "./adapters/apprenticeship";
import { parseOewsAuto, type WageRecord } from "./adapters/bls";
import { parseOnetOccupations, type OccupationRecord } from "./adapters/onet";
import {
  parseScorecardInstitutions,
  parseScorecardPrograms,
  type InstitutionRecord,
  type ProgramRecord,
} from "./adapters/scorecard";
import {
  deriveFromInstitutions,
  deriveFromOccupations,
  deriveFromSponsors,
  deriveFromWages,
  mergeDerived,
} from "./derive";
import { looksLikeZip, readLocalOrFetch } from "./fetch_feed";
import {
  APPRENTICESHIP_CSV_URL,
  BLS_OEWS_NATIONAL_ZIP_URLS,
  BLS_OEWS_TABLE1_URL,
  ONET_OCCUPATION_CSV_URL,
  SCORECARD_FIELD_OF_STUDY_ZIP_URL,
  SCORECARD_INSTITUTION_ZIP_URL,
} from "./urls";
import type { Warehouse } from "./warehouse";
import { csvEntryMatch, unzipMatchingFile } from "./zip";

export type IngestSource =
  | "apprenticeship_gov"
  | "scorecard"
  | "bls"
  | "onet"
  | "all";

export type IngestOptions = {
  source: IngestSource;
  file?: string;
  limit?: number;
  dryRun?: boolean;
  skipDerive?: boolean;
  warehouse?: Warehouse;
};

export type SourceReport = {
  source: string;
  source_url: string;
  fetched_at: string;
  rows: number;
  extra?: Record<string, number>;
};

export type IngestReport = {
  dryRun: boolean;
  sources: SourceReport[];
  derivedEvents: number;
  derivedInsights: number;
};

async function loadTextFromMaybeZip(
  buffer: Buffer,
  sourceUrl: string,
  match = csvEntryMatch
): Promise<string> {
  if (!looksLikeZip(buffer)) return buffer.toString("utf8");
  const extracted = await unzipMatchingFile(buffer, match);
  try {
    return await readFile(extracted.filePath, "utf8");
  } finally {
    await extracted.cleanup();
  }
}

export async function ingestApprenticeship(
  opts: IngestOptions
): Promise<{ rows: SponsorRecord[]; report: SourceReport }> {
  const loaded = await readLocalOrFetch(APPRENTICESHIP_CSV_URL, { file: opts.file });
  const text = loaded.buffer.toString("utf8");
  const rows = parseApprenticeshipSponsors(
    text,
    { source_url: loaded.sourceUrl, fetched_at: loaded.fetchedAt },
    { limit: opts.limit }
  );
  if (!opts.dryRun && opts.warehouse) {
    await opts.warehouse.upsertSponsors(rows);
  }
  return {
    rows,
    report: {
      source: "apprenticeship_gov",
      source_url: loaded.sourceUrl,
      fetched_at: loaded.fetchedAt,
      rows: rows.length,
    },
  };
}

export async function ingestScorecard(
  opts: IngestOptions
): Promise<{
  institutions: InstitutionRecord[];
  programs: ProgramRecord[];
  reports: SourceReport[];
}> {
  const instLoaded = await readLocalOrFetch(SCORECARD_INSTITUTION_ZIP_URL, {
    file: opts.file,
  });
  const instText = await loadTextFromMaybeZip(instLoaded.buffer, instLoaded.sourceUrl);
  const institutions = parseScorecardInstitutions(
    instText,
    { source_url: instLoaded.sourceUrl, fetched_at: instLoaded.fetchedAt },
    { limit: opts.limit, operatingOnly: true }
  );
  if (!opts.dryRun && opts.warehouse) {
    await opts.warehouse.upsertInstitutions(institutions);
  }

  let programs: ProgramRecord[] = [];
  let fosReport: SourceReport | null = null;
  if (!opts.file) {
    const fosLoaded = await readLocalOrFetch(SCORECARD_FIELD_OF_STUDY_ZIP_URL);
    const fosText = await loadTextFromMaybeZip(fosLoaded.buffer, fosLoaded.sourceUrl);
    programs = parseScorecardPrograms(
      fosText,
      { source_url: fosLoaded.sourceUrl, fetched_at: fosLoaded.fetchedAt },
      { limit: opts.limit }
    );
    if (!opts.dryRun && opts.warehouse) {
      await opts.warehouse.upsertPrograms(programs);
    }
    fosReport = {
      source: "scorecard",
      source_url: fosLoaded.sourceUrl,
      fetched_at: fosLoaded.fetchedAt,
      rows: programs.length,
      extra: { field_of_study: programs.length },
    };
  }

  const reports: SourceReport[] = [
    {
      source: "scorecard",
      source_url: instLoaded.sourceUrl,
      fetched_at: instLoaded.fetchedAt,
      rows: institutions.length,
      extra: { institutions: institutions.length },
    },
  ];
  if (fosReport) reports.push(fosReport);
  return { institutions, programs, reports };
}

export async function ingestOnet(
  opts: IngestOptions
): Promise<{ rows: OccupationRecord[]; report: SourceReport }> {
  const loaded = await readLocalOrFetch(ONET_OCCUPATION_CSV_URL, { file: opts.file });
  const text = await loadTextFromMaybeZip(loaded.buffer, loaded.sourceUrl);
  const rows = parseOnetOccupations(
    text,
    { source_url: loaded.sourceUrl, fetched_at: loaded.fetchedAt },
    { limit: opts.limit }
  );
  if (!opts.dryRun && opts.warehouse) {
    await opts.warehouse.upsertOccupations(rows);
  }
  return {
    rows,
    report: {
      source: "onet",
      source_url: loaded.sourceUrl,
      fetched_at: loaded.fetchedAt,
      rows: rows.length,
    },
  };
}

export async function ingestBls(
  opts: IngestOptions
): Promise<{ rows: WageRecord[]; report: SourceReport }> {
  const urls = opts.file ? [BLS_OEWS_TABLE1_URL] : [BLS_OEWS_TABLE1_URL, ...BLS_OEWS_NATIONAL_ZIP_URLS];
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const loaded = await readLocalOrFetch(url, { file: opts.file });
      const text = looksLikeZip(loaded.buffer)
        ? await loadTextFromMaybeZip(loaded.buffer, loaded.sourceUrl, (name) => {
            const lower = name.toLowerCase();
            return (
              lower.endsWith(".txt") ||
              lower.endsWith(".csv") ||
              lower.includes("national") && (lower.endsWith(".xlsx") || lower.endsWith(".xls"))
            );
          })
        : loaded.buffer.toString("utf8");
      const rows = parseOewsAuto(
        text,
        { source_url: loaded.sourceUrl, fetched_at: loaded.fetchedAt },
        { limit: opts.limit }
      );
      if (rows.length === 0) {
        lastError = new Error("bls_parse_empty");
        continue;
      }
      if (!opts.dryRun && opts.warehouse) {
        await opts.warehouse.upsertWages(rows);
      }
      return {
        rows,
        report: {
          source: "bls",
          source_url: loaded.sourceUrl,
          fetched_at: loaded.fetchedAt,
          rows: rows.length,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (opts.file) break;
    }
  }
  throw lastError ?? new Error("bls_ingest_failed");
}

export async function runIngest(opts: IngestOptions): Promise<IngestReport> {
  const sources: SourceReport[] = [];
  const bundles = [];
  const want = opts.source;

  if (want === "all" || want === "apprenticeship_gov") {
    const result = await ingestApprenticeship(opts);
    sources.push(result.report);
    bundles.push(deriveFromSponsors(result.rows));
  }
  if (want === "all" || want === "scorecard") {
    const result = await ingestScorecard(opts);
    sources.push(...result.reports);
    bundles.push(deriveFromInstitutions(result.institutions));
  }
  if (want === "all" || want === "onet") {
    const result = await ingestOnet(opts);
    sources.push(result.report);
    bundles.push(deriveFromOccupations(result.rows));
  }
  if (want === "all" || want === "bls") {
    try {
      const result = await ingestBls(opts);
      sources.push(result.report);
      bundles.push(deriveFromWages(result.rows));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sources.push({
        source: "bls",
        source_url: BLS_OEWS_TABLE1_URL,
        fetched_at: new Date().toISOString(),
        rows: 0,
        extra: { error: 1 },
      });
      if (want === "bls") throw err;
      console.error(`bls ingest skipped: ${message}`);
    }
  }

  const derived = mergeDerived(bundles);
  if (!opts.dryRun && !opts.skipDerive && opts.warehouse) {
    for (const event of derived.events) {
      await opts.warehouse.upsertDerivedEvent(event);
    }
    for (const insight of derived.insights) {
      await opts.warehouse.upsertDerivedInsight(insight);
    }
  }

  return {
    dryRun: Boolean(opts.dryRun),
    sources,
    derivedEvents: derived.events.length,
    derivedInsights: derived.insights.length,
  };
}

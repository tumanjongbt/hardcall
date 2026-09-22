import { readFile } from "node:fs/promises";
import { parseApprenticeshipSponsors, type SponsorRecord } from "./adapters/apprenticeship";
import { fetchBea, parseBeaFile } from "./adapters/bea";
import { parseOewsAuto, type WageRecord } from "./adapters/bls";
import { parseEpTable, parseEpXlsx, type ProjectionRecord } from "./adapters/bls_ep";
import {
  fetchCareerOneStop,
  parseCareerOneStopPayload,
  type CareerOneStopBundle,
} from "./adapters/careeronestop";
import { fetchAcs, parseAcsFile, type AcsPlace } from "./adapters/census";
import { fetchFred, parseFredFile, type FredPoint } from "./adapters/fred";
import { parseOnetOccupations, type OccupationRecord } from "./adapters/onet";
import {
  parseScorecardInstitutions,
  parseScorecardPrograms,
  type InstitutionRecord,
  type ProgramRecord,
} from "./adapters/scorecard";
import { CREDENTIAL_HELP, keyedAdapterEnabled } from "./credentials";
import { econFromAcs, econFromBea, econFromFred } from "./econ_rows";
import {
  deriveFromAcs,
  deriveFromBea,
  deriveFromCareerOneStop,
  deriveFromFred,
  deriveFromInstitutions,
  deriveFromOccupations,
  deriveFromProjections,
  deriveFromSponsors,
  deriveFromWages,
  mergeDerived,
  type DerivedBundle,
} from "./derive";
import { looksLikeZip, readLocalOrFetch } from "./fetch_feed";
import {
  APPRENTICESHIP_CSV_URL,
  BEA_API_DOCS,
  BLS_EP_HTM_URL,
  BLS_EP_MATRIX_XLSX_URL,
  BLS_EP_XLSX_URL,
  BLS_OEWS_NATIONAL_ZIP_URLS,
  BLS_OEWS_TABLE1_URL,
  CAREERONESTOP_LICENSE_DOCS,
  CENSUS_ACS5_DOCS,
  FRED_SERIES_DOCS,
  ONET_OCCUPATION_CSV_URL,
  SCORECARD_FIELD_OF_STUDY_ZIP_URL,
  SCORECARD_INSTITUTION_ZIP_URL,
} from "./urls";
import type { Warehouse } from "./warehouse";
import { csvEntryMatch, unzipMatchingFile } from "./zip";

export const INGEST_SOURCES = [
  "all",
  "apprenticeship_gov",
  "scorecard",
  "bls",
  "onet",
  "bls_ep",
  "careeronestop",
  "census",
  "bea",
  "fred",
] as const;

export type IngestSource = (typeof INGEST_SOURCES)[number];

export { keyedAdapterEnabled };

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

const BLS_EP_FILE_HINT =
  "bls.gov often returns HTTP 403 (Akamai). Download Table 1.2 from https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm (XLSX or the HTML table) and rerun: ingest --source bls_ep --file PATH";

export async function ingestBlsEp(
  opts: IngestOptions
): Promise<{ rows: ProjectionRecord[]; report: SourceReport }> {
  const urls = opts.file
    ? [process.env.BLS_EP_URL || BLS_EP_HTM_URL]
    : [BLS_EP_XLSX_URL, BLS_EP_HTM_URL, BLS_EP_MATRIX_XLSX_URL];
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const loaded = await readLocalOrFetch(url, { file: opts.file });
      const provenance = { source_url: loaded.sourceUrl, fetched_at: loaded.fetchedAt };
      const rows = looksLikeZip(loaded.buffer)
        ? await parseEpXlsx(loaded.buffer, provenance, { limit: opts.limit })
        : parseEpTable(loaded.buffer.toString("utf8"), provenance, { limit: opts.limit });
      if (rows.length === 0) {
        lastError = new Error("bls_ep_parse_empty");
        if (opts.file) break;
        continue;
      }
      if (!opts.dryRun && opts.warehouse) {
        await opts.warehouse.upsertProjections(rows);
      }
      return {
        rows,
        report: {
          source: "bls_ep",
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
  throw new Error(`${lastError?.message ?? "bls_ep_ingest_failed"}. ${BLS_EP_FILE_HINT}`);
}

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

export async function ingestCareerOneStop(
  opts: IngestOptions
): Promise<{ bundle: CareerOneStopBundle; report: SourceReport }> {
  const fetchedAt = new Date().toISOString();
  const bundle = opts.file
    ? parseCareerOneStopPayload(await readJsonFile(opts.file), { fetched_at: fetchedAt }, {
        limit: opts.limit,
      })
    : await fetchCareerOneStop(process.env, { fetched_at: fetchedAt }, { limit: opts.limit });
  if (!opts.dryRun && opts.warehouse) {
    const warehouse = opts.warehouse;
    if (bundle.wages.length > 0) await warehouse.upsertWages(bundle.wages);
    if (bundle.licenses.length > 0) {
      await upsertWarehouse("licenses", () => warehouse.upsertLicenses(bundle.licenses));
    }
    if (bundle.certifications.length > 0) {
      await upsertWarehouse("certifications", () =>
        warehouse.upsertCertifications(bundle.certifications)
      );
    }
  }
  return {
    bundle,
    report: {
      source: "careeronestop",
      source_url: CAREERONESTOP_LICENSE_DOCS,
      fetched_at: bundle.licenses[0]?.fetched_at ?? bundle.certifications[0]?.fetched_at ?? fetchedAt,
      rows: bundle.licenses.length + bundle.certifications.length + bundle.wages.length,
      extra: {
        licenses: bundle.licenses.length,
        certifications: bundle.certifications.length,
        wages: bundle.wages.length,
      },
    },
  };
}

export async function ingestCensus(
  opts: IngestOptions
): Promise<{ places: AcsPlace[]; report: SourceReport }> {
  const fetchedAt = new Date().toISOString();
  const extract = opts.file
    ? parseAcsFile(await readJsonFile(opts.file), fetchedAt)
    : await fetchAcs(process.env, fetchedAt);
  const places = opts.limit ? extract.places.slice(0, opts.limit) : extract.places;
  if (!opts.dryRun && opts.warehouse) {
    const warehouse = opts.warehouse;
    const indicators = econFromAcs(places);
    if (indicators.length > 0) {
      await upsertWarehouse("econ_indicators", () => warehouse.upsertEcon(indicators));
    }
  }
  return {
    places,
    report: {
      source: "census",
      source_url: extract.source_url,
      fetched_at: places[0]?.fetched_at ?? fetchedAt,
      rows: places.length,
      extra: { year: Number(extract.year) || 0 },
    },
  };
}

export async function ingestBea(opts: IngestOptions): Promise<{
  gdp: Awaited<ReturnType<typeof fetchBea>>["gdp"];
  income: Awaited<ReturnType<typeof fetchBea>>["income"];
  report: SourceReport;
}> {
  const fetchedAt = new Date().toISOString();
  const extract = opts.file
    ? parseBeaFile(await readJsonFile(opts.file), fetchedAt)
    : await fetchBea(process.env, fetchedAt);
  if (!opts.dryRun && opts.warehouse) {
    const warehouse = opts.warehouse;
    const indicators = econFromBea([...extract.gdp, ...extract.income]);
    if (indicators.length > 0) {
      await upsertWarehouse("econ_indicators", () => warehouse.upsertEcon(indicators));
    }
  }
  return {
    gdp: extract.gdp,
    income: extract.income,
    report: {
      source: "bea",
      source_url: extract.income[0]?.source_url ?? extract.gdp[0]?.source_url ?? BEA_API_DOCS,
      fetched_at: extract.income[0]?.fetched_at ?? extract.gdp[0]?.fetched_at ?? fetchedAt,
      rows: extract.gdp.length + extract.income.length,
      extra: { gdp: extract.gdp.length, income: extract.income.length },
    },
  };
}

export async function ingestFred(
  opts: IngestOptions
): Promise<{ points: FredPoint[]; report: SourceReport }> {
  const fetchedAt = new Date().toISOString();
  const points = opts.file
    ? parseFredFile(await readJsonFile(opts.file), fetchedAt)
    : await fetchFred(process.env, fetchedAt);
  if (!opts.dryRun && opts.warehouse) {
    const warehouse = opts.warehouse;
    const indicators = econFromFred(points);
    if (indicators.length > 0) {
      await upsertWarehouse("econ_indicators", () => warehouse.upsertEcon(indicators));
    }
  }
  return {
    points,
    report: {
      source: "fred",
      source_url: points[0]?.source_url ?? FRED_SERIES_DOCS,
      fetched_at: points[0]?.fetched_at ?? fetchedAt,
      rows: points.length,
    },
  };
}

/** A drifted live table must not abort the rest of that source's ingest. */
async function upsertWarehouse(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${label} warehouse upsert skipped: ${message}`);
  }
}

function skippedReport(source: string, sourceUrl: string, missingCredentials: boolean): SourceReport {
  return {
    source,
    source_url: sourceUrl,
    fetched_at: new Date().toISOString(),
    rows: 0,
    extra: missingCredentials ? { skipped: 1, missing_credentials: 1 } : { error: 1 },
  };
}

export async function runIngest(opts: IngestOptions): Promise<IngestReport> {
  const sources: SourceReport[] = [];
  const bundles: DerivedBundle[] = [];
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
      sources.push(skippedReport("bls", BLS_OEWS_TABLE1_URL, false));
      if (want === "bls") throw err;
      console.error(`bls ingest skipped: ${message}`);
    }
  }
  if (want === "all" || want === "bls_ep") {
    try {
      const result = await ingestBlsEp(opts);
      sources.push(result.report);
      bundles.push(deriveFromProjections(result.rows));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sources.push(skippedReport("bls_ep", BLS_EP_HTM_URL, false));
      if (want === "bls_ep") throw err;
      console.error(`bls_ep ingest skipped: ${message}`);
    }
  }
  if (want === "all" || want === "careeronestop") {
    if (want === "all" && !opts.file && !keyedAdapterEnabled("careeronestop", process.env)) {
      sources.push(skippedReport("careeronestop", CAREERONESTOP_LICENSE_DOCS, true));
      console.error(`careeronestop ingest skipped: ${CREDENTIAL_HELP.careeronestop}`);
    } else {
      try {
        const result = await ingestCareerOneStop(opts);
        sources.push(result.report);
        bundles.push(deriveFromCareerOneStop(result.bundle));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sources.push(skippedReport("careeronestop", CAREERONESTOP_LICENSE_DOCS, false));
        if (want === "careeronestop") throw err;
        console.error(`careeronestop ingest skipped: ${message}`);
      }
    }
  }
  if (want === "all" || want === "census") {
    if (want === "all" && !opts.file && !keyedAdapterEnabled("census", process.env)) {
      sources.push(skippedReport("census", CENSUS_ACS5_DOCS, true));
      console.error(`census ingest skipped: ${CREDENTIAL_HELP.census}`);
    } else {
      try {
        const result = await ingestCensus(opts);
        sources.push(result.report);
        bundles.push(deriveFromAcs(result.places));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sources.push(skippedReport("census", CENSUS_ACS5_DOCS, false));
        if (want === "census") throw err;
        console.error(`census ingest skipped: ${message}`);
      }
    }
  }
  if (want === "all" || want === "bea") {
    if (want === "all" && !opts.file && !keyedAdapterEnabled("bea", process.env)) {
      sources.push(skippedReport("bea", BEA_API_DOCS, true));
      console.error(`bea ingest skipped: ${CREDENTIAL_HELP.bea}`);
    } else {
      try {
        const result = await ingestBea(opts);
        sources.push(result.report);
        bundles.push(deriveFromBea({ gdp: result.gdp, income: result.income }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sources.push(skippedReport("bea", BEA_API_DOCS, false));
        if (want === "bea") throw err;
        console.error(`bea ingest skipped: ${message}`);
      }
    }
  }
  if (want === "all" || want === "fred") {
    if (want === "all" && !opts.file && !keyedAdapterEnabled("fred", process.env)) {
      sources.push(skippedReport("fred", FRED_SERIES_DOCS, true));
      console.error(`fred ingest skipped: ${CREDENTIAL_HELP.fred}`);
    } else {
      try {
        const result = await ingestFred(opts);
        sources.push(result.report);
        bundles.push(deriveFromFred(result.points));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sources.push(skippedReport("fred", FRED_SERIES_DOCS, false));
        if (want === "fred") throw err;
        console.error(`fred ingest skipped: ${message}`);
      }
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

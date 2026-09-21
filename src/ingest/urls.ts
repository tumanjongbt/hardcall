/** Official keyless bulk feeds. Override with env when a release filename changes. */

/**
 * Phase A (keyless): scorecard zips, BLS OEWS tables, O*NET database CSV.
 * apprenticeship.gov CSV is also keyless (Phase B in the source map; shipped early).
 * Phase B CareerOneStop (token required): never persist Bing geocodes
 * (Microsoft Bing ToS — no store/share). COS adapter is not in this worker.
 */

export const APPRENTICESHIP_CSV_URL =
  process.env.APPRENTICESHIP_CSV_URL ||
  "https://www.apprenticeship.gov/sites/default/files/wps/oa_partner_sponsors.csv";

export const SCORECARD_DATA_HOME = "https://collegescorecard.ed.gov/data/";

export const SCORECARD_INSTITUTION_ZIP_URL =
  process.env.SCORECARD_INSTITUTION_URL ||
  "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip";

export const SCORECARD_FIELD_OF_STUDY_ZIP_URL =
  process.env.SCORECARD_FIELD_OF_STUDY_URL ||
  "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_06102026.zip";

export const ONET_OCCUPATION_CSV_URL =
  process.env.ONET_OCCUPATION_URL ||
  "https://www.onetcenter.org/dl_files/database/db_31_0_csv/occupation_data.csv";

export const ONET_DATABASE_HOME = "https://www.onetcenter.org/database.html";

export const BLS_OEWS_TABLES = "https://www.bls.gov/oes/tables.htm";

export const BLS_OEWS_TABLE1_URL =
  process.env.BLS_OEWS_URL ||
  "https://www.bls.gov/news.release/ocwage.t01.htm";

export const BLS_OEWS_NATIONAL_ZIP_URLS = [
  "https://www.bls.gov/oes/special.requests/oesm25nat.zip",
  "https://www.bls.gov/oes/special-requests/oesm25nat.zip",
  "https://www.bls.gov/oes/2025/may/oesm25nat.zip",
];

export const INGEST_USER_AGENT =
  "Hardcall/0.1 (+https://github.com/tumanjongbt/hardcall; official bulk ingest; no API key)";

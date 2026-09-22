/** Official keyless bulk feeds. Override with env when a release filename changes. */

/**
 * Phase A (keyless): scorecard zips, BLS OEWS tables, O*NET database CSV.
 * apprenticeship.gov CSV is keyless. BLS Employment Projections Table 1.2 is
 * keyless too (xlsx/htm); bls.gov often 403s, so `--file` is the bypass.
 * Phase B/C APIs (CareerOneStop, Census, BEA, FRED) run only when their env
 * keys are set. CareerOneStop must never persist Bing geocodes.
 * Credential Engine / CTDL is not wired: registry access needs an account and
 * API keys (https://apps.credentialengine.org/accounts/). CareerOneStop
 * certifications cover that credential gap without a second vendor.
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

/** Human-readable Table 1.2 (2024–2034 vintage as of the Aug 2025 EP release). */
export const BLS_EP_TABLE_URL =
  "https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm";

export const BLS_EP_XLSX_URL =
  process.env.BLS_EP_URL ||
  "https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.xlsx";

export const BLS_EP_HTM_URL = BLS_EP_TABLE_URL;

/** National matrix workbook linked from the EP tables pages. Different shape; tried last. */
export const BLS_EP_MATRIX_XLSX_URL = "https://www.bls.gov/emp/ind-occ-matrix/occupation.xlsx";

export const CAREERONESTOP_API_ORIGIN = "https://api.careeronestop.org";

export const CAREERONESTOP_LICENSE_DOCS =
  "https://www.careeronestop.org/Developers/WebAPI/Licenses/list-licenses.aspx";

export const CAREERONESTOP_CERT_DOCS =
  "https://www.careeronestop.org/Developers/WebAPI/Certifications/list-certifications.aspx";

export const CAREERONESTOP_WAGE_DOCS =
  "https://www.careeronestop.org/Developers/WebAPI/Salaries/get-salary-details.aspx";

export const CENSUS_ACS5_DOCS = "https://www.census.gov/data/developers/data-sets/acs-5year.html";

export const BEA_API_DOCS = "https://apps.bea.gov/API/docs/index.htm";

export const FRED_SERIES_DOCS = "https://fred.stlouisfed.org/docs/api/fred/series_observations.html";

export const INGEST_USER_AGENT =
  "Hardcall/0.1 (+https://github.com/tumanjongbt/hardcall; official bulk ingest)";

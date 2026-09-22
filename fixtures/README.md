# Official-feed fixtures

Excerpts of public bulk files used by adapter tests. Numbers and names are from the source files, not invented. Apprenticeship contact/email/phone columns are blanked in the sample.

| File | Source |
| --- | --- |
| `oa_partner_sponsors_sample.csv` | https://www.apprenticeship.gov/sites/default/files/wps/oa_partner_sponsors.csv |
| `scorecard_institutions_sample.csv` | College Scorecard Most-Recent-Cohorts-Institution (10 Jun 2026 zip) |
| `scorecard_field_of_study_sample.csv` | College Scorecard Most-Recent-Cohorts-Field-of-Study (10 Jun 2026 zip) |
| `onet_occupation_data_sample.csv` | https://www.onetcenter.org/dl_files/database/db_31_0_csv/occupation_data.csv |
| `bls_oes_table1_sample.txt` | https://www.bls.gov/news.release/ocwage.t01.htm (OEWS May 2025 Table 1) |
| `bls_ep_table_1_2_sample.csv` | BLS EP Table 1.2, 2024–2034 (employment in thousands). Excerpt of published rows |
| `bls_ep_table_1_2_sample.html` | Same table, HTML shape of https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm |
| `bls_ep_table_1_2_sample.xlsx` | Same total and wind-turbine rows in an xlsx workbook (shared strings) |
| `careeronestop_sample.json` | CareerOneStop List Licenses / List Certifications / Get Salary example bodies (docs). Wage year in that example is 2020 |
| `census_acs5_2023_sample.json` | ACS 5-year 2023 detailed tables (B19013, B19301, B23025, B01003) for US, AL, CA, DC via data.census.gov |
| `bea_regional_sample.json` | BEA API user-guide SAINC1 line 3 (per capita personal income), 2013, including a region row the parser drops |
| `fred_observations_sample.json` | Historical April 2020 prints: UNRATE 14.8; CPIAUCSL 256.032 (BLS CUSR0000SA0, index 1982-84=100). Not the latest vintage — live ingest uses `sort_order=desc&limit=1` |

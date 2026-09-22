import type { BeaObservation } from "./adapters/bea";
import type { AcsPlace } from "./adapters/census";
import type { FredPoint } from "./adapters/fred";
import type { EconIndicatorRecord } from "./warehouse_pg";

/**
 * Published observations only. ACS unemployment is stored as the two Census
 * counts, not a rate computed here.
 */
export function econFromAcs(places: AcsPlace[]): EconIndicatorRecord[] {
  const rows: EconIndicatorRecord[] = [];
  for (const place of places) {
    const measures: { series_id: string; title: string; value: number | null; unit: string }[] = [
      {
        series_id: "B19013_001E",
        title: "Median household income",
        value: place.median_household_income,
        unit: "dollars",
      },
      {
        series_id: "B19301_001E",
        title: "Per capita income",
        value: place.per_capita_income,
        unit: "dollars",
      },
      {
        series_id: "B23025_003E",
        title: "Civilian labor force",
        value: place.civilian_labor_force,
        unit: "persons",
      },
      {
        series_id: "B23025_005E",
        title: "Unemployed",
        value: place.unemployed,
        unit: "persons",
      },
      {
        series_id: "B01003_001E",
        title: "Total population",
        value: place.population,
        unit: "persons",
      },
    ];
    for (const measure of measures) {
      if (measure.value == null) continue;
      rows.push({
        series_id: measure.series_id,
        title: measure.title,
        geo_id: place.geo_id,
        geo_name: place.name,
        period: place.year,
        value: measure.value,
        unit: measure.unit,
        source: "census",
        source_url: place.source_url,
        fetched_at: place.fetched_at,
      });
    }
  }
  return rows;
}

export function econFromBea(rows: BeaObservation[]): EconIndicatorRecord[] {
  const out: EconIndicatorRecord[] = [];
  for (const row of rows) {
    if (row.value == null) continue;
    out.push({
      series_id: row.line_code ? `${row.table}:${row.line_code}` : row.table,
      title: row.table,
      geo_id: row.geo_fips,
      geo_name: row.geo_name,
      period: row.time_period,
      value: row.value,
      unit: row.unit,
      source: "bea",
      source_url: row.source_url,
      fetched_at: row.fetched_at,
    });
  }
  return out;
}

export function econFromFred(points: FredPoint[]): EconIndicatorRecord[] {
  return points.map((point) => ({
    series_id: point.series_id,
    title: point.title,
    geo_id: "US",
    geo_name: "United States",
    period: point.date,
    value: point.value,
    unit: point.unit,
    source: "fred",
    source_url: point.source_url,
    fetched_at: point.fetched_at,
  }));
}

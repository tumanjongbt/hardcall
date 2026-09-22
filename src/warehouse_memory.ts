import type { CertificationRecord, LicenseRecord } from "./ingest/adapters/careeronestop";
import type { EconIndicatorRecord } from "./ingest/warehouse_pg";
import type { Warehouse, WarehouseStats } from "./ingest/warehouse";
import {
  buildFeedRows,
  compareWarehouseRows,
  matchesWarehouseRow,
  type FeedSnapshot,
  type WarehouseListQuery,
  type WarehousePage,
  type WarehouseResource,
} from "./warehouse_query";

export type MemoryWarehouseData = {
  institutions?: Record<string, unknown>[];
  programs?: Record<string, unknown>[];
  sponsors?: Record<string, unknown>[];
  occupations?: Record<string, unknown>[];
  wages?: Record<string, unknown>[];
  projections?: Record<string, unknown>[];
  credentials?: Record<string, unknown>[];
  licenses?: Record<string, unknown>[];
  certifications?: Record<string, unknown>[];
  econ?: Record<string, unknown>[];
};

function rowsOf(data: MemoryWarehouseData, resource: WarehouseResource): Record<string, unknown>[] {
  return data[resource] ?? [];
}

function maxFetched(rows: Record<string, unknown>[]): string | null {
  let last: string | null = null;
  for (const row of rows) {
    const fetched = row.fetched_at;
    if (typeof fetched !== "string") continue;
    if (!last || fetched > last) last = fetched;
  }
  return last;
}

function bySource(rows: Record<string, unknown>[], source: string): Record<string, unknown>[] {
  return rows.filter((row) => row.source === source);
}

export function createMemoryWarehouse(seed: MemoryWarehouseData = {}): Warehouse & {
  data: MemoryWarehouseData;
} {
  const data: MemoryWarehouseData = {
    institutions: [...(seed.institutions ?? [])],
    programs: [...(seed.programs ?? [])],
    sponsors: [...(seed.sponsors ?? [])],
    occupations: [...(seed.occupations ?? [])],
    wages: [...(seed.wages ?? [])],
    projections: [...(seed.projections ?? [])],
    credentials: [...(seed.credentials ?? [])],
    licenses: [...(seed.licenses ?? [])],
    certifications: [...(seed.certifications ?? [])],
    econ: [...(seed.econ ?? [])],
  };

  const stats = (): WarehouseStats => ({
    institutions: data.institutions?.length ?? 0,
    programs: data.programs?.length ?? 0,
    apprenticeship_sponsors: data.sponsors?.length ?? 0,
    occupations: data.occupations?.length ?? 0,
    wage_observations: data.wages?.length ?? 0,
    projections: data.projections?.length ?? 0,
    credentials: data.credentials?.length ?? 0,
    licenses: data.licenses?.length ?? 0,
    certifications: data.certifications?.length ?? 0,
    econ_indicators: data.econ?.length ?? 0,
    latest_fetched_at: maxFetched([
      ...(data.institutions ?? []),
      ...(data.programs ?? []),
      ...(data.sponsors ?? []),
      ...(data.occupations ?? []),
      ...(data.wages ?? []),
      ...(data.projections ?? []),
      ...(data.credentials ?? []),
      ...(data.licenses ?? []),
      ...(data.certifications ?? []),
      ...(data.econ ?? []),
    ]),
  });

  const list = async (
    resource: WarehouseResource,
    query: WarehouseListQuery
  ): Promise<WarehousePage> => {
    const filtered = rowsOf(data, resource)
      .filter((row) => matchesWarehouseRow(resource, row, query))
      .sort((a, b) => compareWarehouseRows(resource, a, b));
    return {
      rows: filtered.slice(query.offset, query.offset + query.limit),
      limit: query.limit,
      offset: query.offset,
      total: filtered.length,
    };
  };

  return {
    data,
    async stats() {
      return stats();
    },
    async feeds() {
      const institutions = bySource(data.institutions ?? [], "scorecard");
      const programs = bySource(data.programs ?? [], "scorecard");
      const sponsors = bySource(data.sponsors ?? [], "apprenticeship_gov");
      const occupations = bySource(data.occupations ?? [], "onet");
      const blsWages = bySource(data.wages ?? [], "bls");
      const cosWages = bySource(data.wages ?? [], "careeronestop");
      const projections = bySource(data.projections ?? [], "bls_ep");
      const census = bySource(data.econ ?? [], "census");
      const bea = bySource(data.econ ?? [], "bea");
      const fred = bySource(data.econ ?? [], "fred");
      const pack = (
        parts: { key: string; rows: Record<string, unknown>[] }[]
      ): FeedSnapshot => {
        const row_counts: Record<string, number> = {};
        let rows = 0;
        let last: string | null = null;
        for (const part of parts) {
          row_counts[part.key] = part.rows.length;
          rows += part.rows.length;
          const fetched = maxFetched(part.rows);
          if (fetched && (!last || fetched > last)) last = fetched;
        }
        return { rows, last_fetched_at: last, row_counts };
      };
      const snapshots: Record<string, FeedSnapshot> = {
        scorecard: pack([
          { key: "institutions", rows: institutions },
          { key: "programs", rows: programs },
        ]),
        bls: pack([{ key: "wage_observations", rows: blsWages }]),
        bls_ep: pack([{ key: "projections", rows: projections }]),
        onet: pack([{ key: "occupations", rows: occupations }]),
        apprenticeship_gov: pack([{ key: "apprenticeship_sponsors", rows: sponsors }]),
        careeronestop: pack([
          { key: "licenses", rows: data.licenses ?? [] },
          { key: "certifications", rows: data.certifications ?? [] },
          { key: "wages", rows: cosWages },
        ]),
        census: pack([{ key: "econ_indicators", rows: census }]),
        bea: pack([{ key: "econ_indicators", rows: bea }]),
        fred: pack([{ key: "econ_indicators", rows: fred }]),
        credential_engine: pack([{ key: "credentials", rows: data.credentials ?? [] }]),
      };
      return buildFeedRows(snapshots);
    },
    list,
    async upsertInstitutions() {
      return 0;
    },
    async upsertPrograms() {
      return 0;
    },
    async upsertSponsors() {
      return 0;
    },
    async upsertOccupations() {
      return 0;
    },
    async upsertWages() {
      return 0;
    },
    async upsertProjections() {
      return 0;
    },
    async upsertLicenses(rows: LicenseRecord[]) {
      data.licenses = rows.map((row) => ({ ...row }));
      return rows.length;
    },
    async upsertCertifications(rows: CertificationRecord[]) {
      data.certifications = rows.map((row) => ({ ...row }));
      return rows.length;
    },
    async upsertEcon(rows: EconIndicatorRecord[]) {
      data.econ = rows.map((row) => ({ ...row }));
      return rows.length;
    },
    async upsertDerivedEvent(value) {
      return {
        id: "550e8400-e29b-41d4-a716-446655440000",
        channel: value.channel,
        title: value.title,
        description: value.description,
        emoji: value.emoji,
        tags: value.tags,
        created_at: value.created_at ?? "2026-09-22T00:00:00.000Z",
        source: value.source,
        source_url: value.source_url,
        fetched_at: value.fetched_at,
      };
    },
    async upsertDerivedInsight(value) {
      const now = "2026-09-22T00:00:00.000Z";
      return {
        id: "660e8400-e29b-41d4-a716-446655440000",
        title: value.title,
        value: value.value,
        detail: value.detail ?? "",
        source: value.source ?? "manual",
        source_url: value.source_url ?? null,
        fetched_at: value.fetched_at ?? null,
        created_at: now,
        updated_at: now,
      };
    },
  };
}

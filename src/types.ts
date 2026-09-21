export type EventSource =
  | "synthetic"
  | "manual"
  | "playground"
  | "cli"
  | "bls"
  | "onet"
  | "unknown";

export type InsightSource = "synthetic" | "manual" | "bls" | "onet" | "unknown";

export type CreateEvent = {
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  source: EventSource;
  source_url: string | null;
  fetched_at: string | null;
  /** Insert only. Omitted → database `now()`. */
  created_at?: string;
};

export type EventRow = {
  id: string;
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  created_at: string;
  source: EventSource;
  source_url: string | null;
  fetched_at: string | null;
};

export type ListEventsQuery = {
  limit: number;
  channel?: string;
};

export type EventStore = {
  insertEvent(value: CreateEvent): Promise<EventRow>;
  listEvents(query: ListEventsQuery): Promise<EventRow[]>;
};

export type CreateInsight = {
  title: string;
  value: string;
  /** Present only when the client sent `detail` (omitted on update keeps the stored body). */
  detail?: string;
  /** Present only when the client sent `source` (omitted on update keeps the stored source). */
  source?: InsightSource;
};

export type InsightRow = {
  id: string;
  title: string;
  value: string;
  detail: string;
  source: InsightSource;
  created_at: string;
  updated_at: string;
};

export type InsightStore = {
  upsertInsight(value: CreateInsight): Promise<{ row: InsightRow; created: boolean }>;
  listInsights(): Promise<InsightRow[]>;
};

export type Store = EventStore & InsightStore;

export type CreateEvent = {
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
};

export type EventRow = {
  id: string;
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  created_at: string;
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
};

export type InsightRow = {
  id: string;
  title: string;
  value: string;
  detail: string;
  created_at: string;
  updated_at: string;
};

export type InsightStore = {
  upsertInsight(value: CreateInsight): Promise<{ row: InsightRow; created: boolean }>;
  listInsights(): Promise<InsightRow[]>;
};

export type Store = EventStore & InsightStore;

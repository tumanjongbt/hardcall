export type EventRow = {
  id: string;
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  created_at: string;
};

export type InsightRow = {
  id: string;
  title: string;
  value: string;
  detail: string;
  created_at: string;
  updated_at: string;
};

export type DashboardTab = "events" | "charts" | "insights";

export type PerPage = 50 | 100 | "all";

export type ViewState = {
  tab: DashboardTab;
  page: number;
  perPage: PerPage;
  channel: string | null;
  q: string;
  insight: string | null;
};

export type StreamStatus = "connecting" | "live" | "down";

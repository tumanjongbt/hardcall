import type { AudienceLensId } from "./channels";

export type EventSource =
  | "synthetic"
  | "manual"
  | "playground"
  | "cli"
  | "bls"
  | "onet"
  | "scorecard"
  | "apprenticeship_gov"
  | "bls_ep"
  | "unknown";

export type InsightSource =
  | "synthetic"
  | "manual"
  | "bls"
  | "onet"
  | "scorecard"
  | "apprenticeship_gov"
  | "bls_ep"
  | "unknown";

export type EventRow = {
  id: string;
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  created_at: string;
  source?: EventSource | string;
  source_url?: string | null;
  fetched_at?: string | null;
};

export type InsightRow = {
  id: string;
  title: string;
  value: string;
  detail: string;
  source?: InsightSource | string;
  source_url?: string | null;
  fetched_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardTab = "events" | "charts" | "insights" | "playground" | "admin";

export type PerPage = 50 | 100 | "all";

export type AudienceLens = AudienceLensId;

export type ChartRange = 7 | 14 | 30 | 90;

export type ForecastHorizon = 14 | 30;

export type ViewState = {
  tab: DashboardTab;
  page: number;
  perPage: PerPage;
  channel: string | null;
  q: string;
  insight: string | null;
  /** Charts audience lens; `null` means All stakeholders. */
  lens: AudienceLens | null;
  /** Charts lookback window in UTC days (includes 90-day history). */
  range: ChartRange;
  /** Forward forecast horizon in UTC days (14 or 30). */
  forecast: ForecastHorizon;
  /** Up to two channel ids for path compare. */
  compare: string[];
};

export type StreamStatus = "connecting" | "live" | "down";

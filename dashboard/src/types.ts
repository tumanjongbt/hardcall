export type EventRow = {
  id: string;
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  created_at: string;
};

export type PerPage = 50 | 100 | "all";

export type ViewState = {
  page: number;
  perPage: PerPage;
  channel: string | null;
  q: string;
};

export type StreamStatus = "connecting" | "live" | "down";

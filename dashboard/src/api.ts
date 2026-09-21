import { apiBase, LIST_FETCH_LIMIT } from "./config";
import type { EventRow, StreamStatus } from "./types";

export async function fetchEvents(base = apiBase()): Promise<EventRow[]> {
  const url = `${base}/api/events?limit=${LIST_FETCH_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  const body = (await res.json()) as { events?: unknown };
  if (!Array.isArray(body.events)) {
    throw new Error("invalid_list_payload");
  }
  return body.events as EventRow[];
}

export function subscribeEvents(
  onEvent: (row: EventRow) => void,
  onStatus: (status: StreamStatus) => void,
  base = apiBase()
): () => void {
  const es = new EventSource(`${base}/api/events/stream`);
  onStatus("connecting");
  es.onopen = () => onStatus("live");
  es.onmessage = (message) => {
    try {
      const row = JSON.parse(message.data) as EventRow;
      if (row && typeof row.id === "string") onEvent(row);
    } catch {
      // ignore malformed frames
    }
  };
  es.onerror = () => onStatus("down");
  return () => {
    es.close();
  };
}

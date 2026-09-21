import type { EventRow } from "./types";

export type SseSink = {
  write(chunk: string): boolean | void;
};

export type SseHub = {
  subscribe(sink: SseSink): () => void;
  broadcast(row: EventRow): void;
  clientCount(): number;
};

export function formatSseMessage(row: EventRow): string {
  return `event: message\ndata: ${JSON.stringify(row)}\n\n`;
}

export function createSseHub(): SseHub {
  const sinks = new Set<SseSink>();

  return {
    subscribe(sink) {
      sinks.add(sink);
      return () => {
        sinks.delete(sink);
      };
    },
    broadcast(row) {
      const payload = formatSseMessage(row);
      for (const sink of [...sinks]) {
        try {
          sink.write(payload);
        } catch {
          sinks.delete(sink);
        }
      }
    },
    clientCount() {
      return sinks.size;
    },
  };
}

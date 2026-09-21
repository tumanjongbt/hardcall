import assert from "node:assert/strict";
import { test } from "node:test";
import { createSseHub, formatSseMessage } from "./sse_hub";
import type { EventRow } from "./types";

const row: EventRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  channel: "university",
  title: "CS starting salaries up in metro X",
  description: "optional",
  emoji: "📈",
  tags: ["college_students", "parents"],
  created_at: "2026-09-20T23:56:00.000Z",
  source: "synthetic",
  source_url: null,
  fetched_at: null,
};

test("formatSseMessage is an SSE message with JSON data", () => {
  assert.equal(
    formatSseMessage(row),
    `event: message\ndata: ${JSON.stringify(row)}\n\n`
  );
});

test("hub broadcasts to current subscribers only", () => {
  const hub = createSseHub();
  const a: string[] = [];
  const b: string[] = [];
  const unsubA = hub.subscribe({ write: (chunk) => a.push(chunk) });
  hub.subscribe({ write: (chunk) => b.push(chunk) });

  hub.broadcast(row);
  assert.equal(hub.clientCount(), 2);
  assert.deepEqual(a, [formatSseMessage(row)]);
  assert.deepEqual(b, [formatSseMessage(row)]);

  unsubA();
  assert.equal(hub.clientCount(), 1);
  hub.broadcast({ ...row, title: "second" });
  assert.equal(a.length, 1);
  assert.equal(b.length, 2);
});

test("hub drops a sink that throws on write", () => {
  const hub = createSseHub();
  hub.subscribe({
    write() {
      throw new Error("broken pipe");
    },
  });
  const kept: string[] = [];
  hub.subscribe({ write: (chunk) => kept.push(chunk) });

  hub.broadcast(row);
  assert.equal(hub.clientCount(), 1);
  assert.equal(kept.length, 1);
});

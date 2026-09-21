import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createApp } from "./app";
import { createSseHub, formatSseMessage } from "./sse_hub";
import type { CreateEvent, EventRow, EventStore } from "./types";

function memoryStore(onInsert?: (value: CreateEvent) => EventRow | Promise<EventRow>): EventStore {
  return {
    async insertEvent(value) {
      if (onInsert) return onInsert(value);
      return {
        id: "550e8400-e29b-41d4-a716-446655440000",
        ...value,
        created_at: "2026-09-20T23:56:00.000Z",
      };
    },
  };
}

async function withApp(
  store: EventStore,
  fn: (app: ReturnType<typeof createApp>) => Promise<void>
) {
  const app = createApp(store);
  await app.ready();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test("GET /health", async () => {
  await withApp(memoryStore(), async (app) => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true });
  });
});

test("POST /api/events stores a valid body", async () => {
  let stored: CreateEvent | undefined;
  await withApp(
    memoryStore((value) => {
      stored = value;
      return {
        id: "550e8400-e29b-41d4-a716-446655440000",
        ...value,
        created_at: "2026-09-20T23:56:00.000Z",
      };
    }),
    async (app) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json" },
        payload: {
          channel: "university",
          title: "  CS starting salaries up in metro X  ",
          description: "optional",
          emoji: "📈",
          tags: ["college_students", "parents"],
        },
      });
      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.json(), {
        id: "550e8400-e29b-41d4-a716-446655440000",
        channel: "university",
        title: "CS starting salaries up in metro X",
        description: "optional",
        emoji: "📈",
        tags: ["college_students", "parents"],
        created_at: "2026-09-20T23:56:00.000Z",
      });
      assert.deepEqual(stored, {
        channel: "university",
        title: "CS starting salaries up in metro X",
        description: "optional",
        emoji: "📈",
        tags: ["college_students", "parents"],
      });
    }
  );
});

test("POST /api/events nulls empty optionals", async () => {
  await withApp(
    memoryStore((value) => ({
      id: "550e8400-e29b-41d4-a716-446655440000",
      ...value,
      created_at: "2026-09-20T23:56:00.000Z",
    })),
    async (app) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json" },
        payload: {
          channel: "automation",
          title: "AI shift",
          description: "  ",
          emoji: "",
        },
      });
      assert.equal(res.statusCode, 201);
      const body = res.json() as EventRow;
      assert.equal(body.description, null);
      assert.equal(body.emoji, null);
      assert.deepEqual(body.tags, []);
    }
  );
});

test("POST /api/events validation failures", async () => {
  await withApp(memoryStore(), async (app) => {
    const cases: Array<{ payload: unknown; field: string; rule: string }> = [
      { payload: { title: "x" }, field: "channel", rule: "required" },
      {
        payload: { channel: "university", title: "" },
        field: "title",
        rule: "length_1_200",
      },
      {
        payload: { channel: "nope", title: "x" },
        field: "channel",
        rule: "enum",
      },
      {
        payload: { channel: "university", title: "x", tags: ["parents", "parents"] },
        field: "tags",
        rule: "unique",
      },
      {
        payload: { channel: "university", title: "x", extra: 1 },
        field: "extra",
        rule: "unknown_key",
      },
    ];

    for (const c of cases) {
      const res = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json" },
        payload: c.payload,
      });
      assert.equal(res.statusCode, 400, JSON.stringify(c));
      const body = res.json() as {
        error: string;
        details: { field: string; rule: string }[];
      };
      assert.equal(body.error, "validation_failed");
      assert.ok(
        body.details.some((d) => d.field === c.field && d.rule === c.rule),
        JSON.stringify(body.details)
      );
    }
  });
});

test("POST /api/events rejects non-JSON", async () => {
  await withApp(memoryStore(), async (app) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { "content-type": "text/plain" },
      payload: "channel=university",
    });
    assert.equal(res.statusCode, 415);
    assert.deepEqual(res.json(), { error: "unsupported_media_type" });
  });
});

function listenPort(app: ReturnType<typeof createApp>): number {
  const addr = app.server.address();
  if (typeof addr === "object" && addr) return addr.port;
  throw new Error("missing listen port");
}

function parseSseFrame(frame: string): { comments: string[]; data?: string; event?: string; retry?: string } {
  const comments: string[] = [];
  let data: string | undefined;
  let event: string | undefined;
  let retry: string | undefined;
  for (const rawLine of frame.split("\n")) {
    if (rawLine.startsWith(":")) {
      comments.push(rawLine.slice(1).replace(/^ /, ""));
      continue;
    }
    const colon = rawLine.indexOf(":");
    if (colon === -1) continue;
    const field = rawLine.slice(0, colon);
    let value = rawLine.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data = (data ?? "") + value;
    else if (field === "event") event = value;
    else if (field === "retry") retry = value;
  }
  return { comments, data, event, retry };
}

function openSse(port: number): Promise<{
  frames: ReturnType<typeof parseSseFrame>[];
  close: () => void;
  waitFor: (pred: () => boolean, ms?: number) => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const frames: ReturnType<typeof parseSseFrame>[] = [];
    let buf = "";
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/events/stream",
        headers: { accept: "text/event-stream" },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`SSE status ${res.statusCode}`));
          return;
        }
        assert.match(String(res.headers["content-type"]), /text\/event-stream/);
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (raw.length) frames.push(parseSseFrame(raw));
          }
        });
        resolve({
          frames,
          close: () => {
            req.destroy();
            res.destroy();
          },
          waitFor: (pred, ms = 2000) =>
            new Promise((ok, fail) => {
              const start = Date.now();
              const timer = setInterval(() => {
                if (pred()) {
                  clearInterval(timer);
                  ok();
                } else if (Date.now() - start > ms) {
                  clearInterval(timer);
                  fail(new Error("SSE wait timeout"));
                }
              }, 10);
            }),
        });
      }
    );
    req.on("error", reject);
  });
}

test("GET /api/events/stream broadcasts POST rows as SSE messages", async () => {
  const hub = createSseHub();
  const app = createApp(memoryStore(), { hub, heartbeatMs: 40 });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = listenPort(app);
  const client = await openSse(port);
  try {
    await client.waitFor(() =>
      client.frames.some((f) => f.retry === "5000" || f.comments.includes("connected"))
    );
    assert.equal(hub.clientCount(), 1);

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { "content-type": "application/json" },
      payload: {
        channel: "university",
        title: "streamed row",
        emoji: "📈",
        tags: ["parents"],
      },
    });
    assert.equal(res.statusCode, 201);
    const row = res.json() as EventRow;

    await client.waitFor(() => client.frames.some((f) => f.data && JSON.parse(f.data).id === row.id));
    const message = client.frames.find((f) => f.data && JSON.parse(f.data).id === row.id);
    assert.ok(message);
    assert.equal(message.event, "message");
    assert.deepEqual(JSON.parse(message.data as string), row);
    assert.equal(formatSseMessage(row), `event: message\ndata: ${JSON.stringify(row)}\n\n`);

    await client.waitFor(() => client.frames.some((f) => f.comments.includes("keepalive")));
  } finally {
    client.close();
    await client.waitFor(() => hub.clientCount() === 0).catch(() => undefined);
    await app.close();
  }
  assert.equal(hub.clientCount(), 0);
});

test("GET /api/events/stream fans out to multiple listeners", async () => {
  const app = createApp(memoryStore());
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = listenPort(app);
  const a = await openSse(port);
  const b = await openSse(port);
  try {
    await a.waitFor(() => a.frames.some((f) => f.comments.includes("connected")));
    await b.waitFor(() => b.frames.some((f) => f.comments.includes("connected")));

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { "content-type": "application/json" },
      payload: { channel: "automation", title: "two listeners" },
    });
    const row = res.json() as EventRow;
    await a.waitFor(() => a.frames.some((f) => f.data?.includes(row.id)));
    await b.waitFor(() => b.frames.some((f) => f.data?.includes(row.id)));
  } finally {
    a.close();
    b.close();
    await app.close();
  }
});

test("POST /api/events persist failure is opaque", async () => {
  await withApp(
    memoryStore(() => {
      throw new Error("ECONNREFUSED secret-host");
    }),
    async (app) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json" },
        payload: { channel: "trade", title: "HVAC demand" },
      });
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.json(), { error: "persist_failed" });
      assert.equal(res.body.includes("secret-host"), false);
    }
  );
});

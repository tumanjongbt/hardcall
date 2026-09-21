import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "./app";
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

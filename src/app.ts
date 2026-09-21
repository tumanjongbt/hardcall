import Fastify, { type FastifyInstance } from "fastify";
import { CHANNELS, validateCreateEvent } from "./events_validate";
import { createSseHub, type SseHub } from "./sse_hub";
import type { EventStore, ListEventsQuery } from "./types";

const SSE_HEARTBEAT_MS = 15_000;
const SSE_RETRY_MS = 5_000;
export const DEFAULT_LIST_LIMIT = 1000;
export const MAX_LIST_LIMIT = 1000;

function isJsonContentType(value: string | undefined): boolean {
  if (!value) return false;
  const media = value.split(";")[0]?.trim().toLowerCase();
  return media === "application/json";
}

function isParserError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { statusCode?: number; code?: string };
  const code = rec.code ?? "";
  return (
    rec.statusCode === 415 ||
    code.startsWith("FST_ERR_CTP") ||
    code === "FST_ERR_CTP_INVALID_JSON_BODY" ||
    code === "FST_ERR_CTP_INVALID_MEDIA_TYPE"
  );
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function parseListQuery(
  query: unknown
):
  | { ok: true; value: ListEventsQuery }
  | { ok: false; details: { field: string; rule: string }[] } {
  const rec =
    query !== null && typeof query === "object" && !Array.isArray(query)
      ? (query as Record<string, unknown>)
      : {};
  const details: { field: string; rule: string }[] = [];

  const rawChannel = firstQueryValue(rec.channel);
  let channel: string | undefined;
  if (rawChannel !== undefined && rawChannel.length > 0) {
    if (!CHANNELS.has(rawChannel)) {
      details.push({ field: "channel", rule: "enum" });
    } else {
      channel = rawChannel;
    }
  }

  let limit = DEFAULT_LIST_LIMIT;
  const rawLimit = firstQueryValue(rec.limit);
  if (rawLimit !== undefined && rawLimit.length > 0) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) {
      details.push({ field: "limit", rule: "integer_range" });
    } else {
      limit = Math.min(n, MAX_LIST_LIMIT);
    }
  }

  if (details.length) return { ok: false, details };
  return channel
    ? { ok: true, value: { limit, channel } }
    : { ok: true, value: { limit } };
}

export function createApp(
  store: EventStore,
  opts?: { logger?: boolean; hub?: SseHub; heartbeatMs?: number }
): FastifyInstance {
  const app = Fastify({
    logger: opts?.logger ?? false,
    requestTimeout: 0,
    connectionTimeout: 0,
  });
  const hub = opts?.hub ?? createSseHub();
  const heartbeatMs = opts?.heartbeatMs ?? SSE_HEARTBEAT_MS;

  app.setErrorHandler((err, _request, reply) => {
    if (isParserError(err)) {
      return reply.code(415).send({ error: "unsupported_media_type" });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "persist_failed" });
  });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  });

  app.options("*", async (_request, reply) => reply.code(204).send());

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/events", async (request, reply) => {
    const parsed = parseListQuery(request.query);
    if (!parsed.ok) {
      return reply.code(400).send({
        error: "validation_failed",
        details: parsed.details,
      });
    }

    try {
      const events = await store.listEvents(parsed.value);
      return reply.send({ events });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "persist_failed" });
    }
  });

  app.get("/api/events/stream", (request, reply) => {
    reply.hijack();
    const raw = reply.raw;
    if (!raw.headersSent) {
      raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
      });
    }
    raw.write(`retry: ${SSE_RETRY_MS}\n\n`);
    raw.write(": connected\n\n");

    const unsubscribe = hub.subscribe({
      write: (chunk) => raw.write(chunk),
    });

    const heartbeat = setInterval(() => {
      raw.write(": keepalive\n\n");
    }, heartbeatMs);
    heartbeat.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    raw.on("close", cleanup);
    raw.on("error", cleanup);
    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);
  });

  app.post("/api/events", async (request, reply) => {
    if (!isJsonContentType(request.headers["content-type"])) {
      return reply.code(415).send({ error: "unsupported_media_type" });
    }

    const parsed = validateCreateEvent(request.body);
    if (!parsed.ok) {
      return reply.code(400).send({
        error: "validation_failed",
        details: parsed.details,
      });
    }

    try {
      const row = await store.insertEvent(parsed.value);
      hub.broadcast(row);
      return reply.code(201).send(row);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "persist_failed" });
    }
  });

  return app;
}

import Fastify, { type FastifyInstance } from "fastify";
import { validateCreateEvent } from "./events_validate";
import type { EventStore } from "./types";

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

export function createApp(
  store: EventStore,
  opts?: { logger?: boolean }
): FastifyInstance {
  const app = Fastify({ logger: opts?.logger ?? false });

  app.setErrorHandler((err, _request, reply) => {
    if (isParserError(err)) {
      return reply.code(415).send({ error: "unsupported_media_type" });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "persist_failed" });
  });

  app.get("/health", async () => ({ ok: true }));

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
      return reply.code(201).send(row);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "persist_failed" });
    }
  });

  return app;
}

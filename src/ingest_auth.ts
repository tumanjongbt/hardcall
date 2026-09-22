import { createHash, timingSafeEqual } from "node:crypto";

/** Shared secret for POST /api/ingest/:source. Empty means the route stays closed. */
export function ingestTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.HARDCALL_INGEST_TOKEN?.trim();
  return token ? token : null;
}

function headerText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

/** Bearer authorization, or the dedicated header. The raw value is never logged. */
export function presentedIngestToken(headers: {
  authorization?: string | string[];
  "x-hardcall-ingest-token"?: string | string[];
}): string {
  const dedicated = headerText(headers["x-hardcall-ingest-token"]);
  if (dedicated) return dedicated;
  const authorization = headerText(headers.authorization);
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  return match?.[1] ?? "";
}

export function ingestTokenMatches(presented: string, expected: string | null): boolean {
  if (!expected || !presented) return false;
  const left = createHash("sha256").update(presented).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

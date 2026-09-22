import { readFile } from "node:fs/promises";
import { INGEST_USER_AGENT } from "./urls";

const DEFAULT_MAX_BYTES = 80 * 1024 * 1024;

export async function readLocalOrFetch(
  sourceUrl: string,
  opts?: { file?: string; maxBytes?: number }
): Promise<{ buffer: Buffer; fetchedAt: string; sourceUrl: string }> {
  const fetchedAt = new Date().toISOString();
  if (opts?.file) {
    const buffer = await readFile(opts.file);
    return { buffer, fetchedAt, sourceUrl };
  }
  const buffer = await fetchBuffer(sourceUrl, opts?.maxBytes ?? DEFAULT_MAX_BYTES);
  return { buffer, fetchedAt, sourceUrl };
}

export async function fetchBuffer(url: string, maxBytes = DEFAULT_MAX_BYTES): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "user-agent": INGEST_USER_AGENT,
      accept: "*/*",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`fetch_failed:${res.status}:${url}`);
  }
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > maxBytes) {
    throw new Error(`fetch_too_large:${len}`);
  }
  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength > maxBytes) {
    throw new Error(`fetch_too_large:${arrayBuf.byteLength}`);
  }
  return Buffer.from(arrayBuf);
}

export function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function looksLikeXlsx(buffer: Buffer, name = ""): boolean {
  return looksLikeZip(buffer) && (name.toLowerCase().endsWith(".xlsx") || buffer.includes(Buffer.from("xl/")));
}

const SECRET_QUERY = new Set(["key", "api_key", "userid", "user_id", "token"]);

/** Drop API keys and CareerOneStop user ids before logging or storing a URL. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const name of [...url.searchParams.keys()]) {
      if (SECRET_QUERY.has(name.toLowerCase())) url.searchParams.set(name, "REDACTED");
    }
    url.pathname = url.pathname
      .replace(/\/v1\/license\/[^/]+\//i, "/v1/license/REDACTED/")
      .replace(/\/v1\/certificationfinder\/[^/]+\//i, "/v1/certificationfinder/REDACTED/")
      .replace(/\/v1\/comparesalaries\/[^/]+\//i, "/v1/comparesalaries/REDACTED/");
    return url.toString();
  } catch {
    return raw.replace(/([?&](?:key|api_key|UserID|userId|token)=)[^&\s]+/gi, "$1REDACTED");
  }
}

export async function fetchJson(
  url: string,
  init?: { headers?: Record<string, string> }
): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "user-agent": INGEST_USER_AGENT,
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    redirect: "follow",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`fetch_failed:${res.status}:${redactUrl(url)}:${text.slice(0, 160).replace(/\s+/g, " ")}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`fetch_not_json:${res.status}:${redactUrl(url)}`);
  }
}

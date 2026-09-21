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

import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

export type ZipMatch = (name: string) => boolean;

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(err ?? new Error("zip_open_failed"));
        return;
      }
      resolve(zip);
    });
  });
}

function nextEntry(zip: yauzl.ZipFile): Promise<yauzl.Entry | null> {
  return new Promise((resolve, reject) => {
    const onEntry = (entry: yauzl.Entry) => {
      cleanup();
      resolve(entry);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      zip.off("entry", onEntry);
      zip.off("end", onEnd);
      zip.off("error", onError);
    };
    zip.once("entry", onEntry);
    zip.once("end", onEnd);
    zip.once("error", onError);
    zip.readEntry();
  });
}

function openEntryStream(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error("zip_entry_stream_failed"));
        return;
      }
      resolve(stream);
    });
  });
}

export async function unzipMatchingFile(
  buffer: Buffer,
  match: ZipMatch
): Promise<{ name: string; filePath: string; cleanup: () => Promise<void> }> {
  const zip = await openZip(buffer);
  const dir = await mkdtemp(path.join(tmpdir(), "hardcall-ingest-"));
  const cleanup = async () => {
    zip.close();
    await rm(dir, { recursive: true, force: true });
  };
  try {
    for (;;) {
      const entry = await nextEntry(zip);
      if (!entry) break;
      const name = entry.fileName.replace(/\\/g, "/");
      if (name.endsWith("/") || name.includes("__MACOSX") || !match(name)) {
        continue;
      }
      const dest = path.join(dir, path.basename(name) || "entry.bin");
      const stream = await openEntryStream(zip, entry);
      await pipeline(stream, createWriteStream(dest));
      return {
        name,
        filePath: dest,
        cleanup: async () => {
          zip.close();
          await rm(dir, { recursive: true, force: true });
        },
      };
    }
    throw new Error("zip_entry_not_found");
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export function csvEntryMatch(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return base.toLowerCase().endsWith(".csv") && !base.startsWith(".");
}

export function tableEntryMatch(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".csv") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  );
}

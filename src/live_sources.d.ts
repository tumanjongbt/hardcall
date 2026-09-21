import type { EventSource } from "./types";

/** Adapter-only live sources. Public POST rejects these with rule `reserved`. */
export const LIVE_SOURCES: readonly EventSource[];
export const LIVE_SOURCE_SET: Set<EventSource>;

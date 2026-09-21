/** Public API origin. Vite inlines VITE_* into the browser bundle — never put secrets here. */
export const DEFAULT_API = "https://hardcall-api.onrender.com";

/**
 * Resolve the events API origin from `VITE_EVENTS_API_URL`.
 * Origin only (scheme + host[:port]). Paths, query, and non-http(s) fall back
 * to the default so the dashboard never fetches an unexpected URL.
 */
export function apiBase(
  env: { VITE_EVENTS_API_URL?: string } = import.meta.env
): string {
  const raw = env.VITE_EVENTS_API_URL;
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_API;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_API;
    return url.origin;
  } catch {
    return DEFAULT_API;
  }
}

export const SEARCH_DEBOUNCE_MS = 300;
export const LIST_FETCH_LIMIT = 1000;
export const INSIGHTS_POLL_MS = 15_000;
export const PLAYGROUND_TOAST_MS = 6_000;

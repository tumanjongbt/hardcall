const DEFAULT_API = "https://hardcall-api.onrender.com";

export function apiBase(
  env: { VITE_EVENTS_API_URL?: string } = import.meta.env
): string {
  const raw = env.VITE_EVENTS_API_URL;
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_API;
  return value.replace(/\/+$/, "");
}

export const SEARCH_DEBOUNCE_MS = 300;
export const LIST_FETCH_LIMIT = 1000;

import { LENS_TAGS } from "./channels";
import type { AudienceLens, EventRow, PerPage } from "./types";

export function matchesQuery(event: EventRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const parts = [
    event.title,
    event.description ?? "",
    ...event.tags,
    ...event.tags.map((tag) => tag.replaceAll("_", " ")),
  ];
  return parts.some((part) => part.toLowerCase().includes(needle));
}

export function matchesLens(event: EventRow, lens: AudienceLens | null): boolean {
  if (!lens) return true;
  const wanted = LENS_TAGS[lens];
  return event.tags.some((tag) => (wanted as readonly string[]).includes(tag));
}

export function filterByLens(events: EventRow[], lens: AudienceLens | null): EventRow[] {
  if (!lens) return events;
  return events.filter((event) => matchesLens(event, lens));
}

export function filterEvents(
  events: EventRow[],
  channel: string | null,
  q: string,
  lens: AudienceLens | null = null
): EventRow[] {
  return events.filter((event) => {
    if (channel && event.channel !== channel) return false;
    if (!matchesQuery(event, q)) return false;
    return matchesLens(event, lens);
  });
}

export function paginate<T>(
  items: T[],
  page: number,
  perPage: PerPage
): { items: T[]; page: number; pageCount: number; total: number } {
  const total = items.length;
  if (perPage === "all" || total === 0) {
    return { items, page: 1, pageCount: 1, total };
  }
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: safePage,
    pageCount,
    total,
  };
}

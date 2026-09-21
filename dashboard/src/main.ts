import { fetchEvents, subscribeEvents } from "./api";
import { SEARCH_DEBOUNCE_MS } from "./config";
import { debounce } from "./debounce";
import { filterEvents, paginate } from "./query";
import {
  renderChannels,
  renderFeed,
  renderMeta,
  renderPagination,
  renderPerPage,
  renderStatus,
} from "./render";
import type { EventRow, StreamStatus, ViewState } from "./types";
import { hrefForState, parseViewState } from "./url-state";

const channelsEl = must("#channel-filters");
const perPageEl = must("#per-page");
const searchEl = must<HTMLInputElement>("#search");
const statusEl = must("#stream-status");
const metaEl = must("#feed-meta");
const feedEl = must("#feed");
const paginationEl = must("#pagination");

let allEvents: EventRow[] = [];
let view = parseViewState(location.search);
let freshIds = new Set<string>();
let status: StreamStatus = "connecting";
let loadError: string | null = null;
let loading = true;

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}

function currentModel() {
  const filtered = filterEvents(allEvents, view.channel, view.q);
  const page = paginate(filtered, view.page, view.perPage);
  if (page.page !== view.page) {
    view = { ...view, page: page.page };
    history.replaceState(view, "", hrefForState(view, location.pathname));
  }
  return {
    events: page.items,
    freshIds,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    view,
    status,
    loadError,
    loading,
  };
}

function paint(): void {
  const model = currentModel();
  renderChannels(channelsEl, model.view, setChannel);
  renderPerPage(perPageEl, model.view, setPerPage);
  renderStatus(statusEl, model.status);
  renderMeta(metaEl, model);
  renderFeed(feedEl, model);
  renderPagination(paginationEl, model, setPage);
  if (searchEl.value !== model.view.q && document.activeElement !== searchEl) {
    searchEl.value = model.view.q;
  }
}

function pushView(next: ViewState): void {
  view = next;
  history.pushState(view, "", hrefForState(view, location.pathname));
  paint();
}

function setChannel(channel: string | null): void {
  if (view.channel === channel) return;
  pushView({ ...view, channel, page: 1 });
}

function setPerPage(perPage: ViewState["perPage"]): void {
  if (view.perPage === perPage) return;
  pushView({ ...view, perPage, page: 1 });
}

function setPage(page: number): void {
  if (page === view.page) return;
  pushView({ ...view, page });
}

const commitSearch = debounce((q: string) => {
  if (q === view.q) return;
  pushView({ ...view, q, page: 1 });
}, SEARCH_DEBOUNCE_MS);

searchEl.addEventListener("input", () => {
  commitSearch(searchEl.value.trim());
});

window.addEventListener("popstate", () => {
  commitSearch.cancel();
  view = parseViewState(location.search);
  searchEl.value = view.q;
  paint();
});

function prependLive(row: EventRow): void {
  if (allEvents.some((event) => event.id === row.id)) return;
  allEvents = [row, ...allEvents];
  freshIds = new Set(freshIds);
  freshIds.add(row.id);
  window.setTimeout(() => {
    if (!freshIds.has(row.id)) return;
    const next = new Set(freshIds);
    next.delete(row.id);
    freshIds = next;
    paint();
  }, 1600);
  paint();
}

function errorMessage(err: unknown): string {
  const statusCode =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status: number }).status)
      : 0;
  if (statusCode === 404) {
    return "GET /api/events is not on this API yet. After merge, Render must redeploy. Live SSE still works once history is available.";
  }
  return err instanceof Error ? err.message : "Failed to load events.";
}

async function loadHistory(): Promise<void> {
  loading = true;
  loadError = null;
  paint();
  try {
    allEvents = await fetchEvents();
  } catch (err) {
    allEvents = [];
    loadError = errorMessage(err);
  } finally {
    loading = false;
    paint();
  }
}

searchEl.value = view.q;
history.replaceState(view, "", hrefForState(view, location.pathname));
paint();
void loadHistory();
subscribeEvents(prependLive, (next) => {
  status = next;
  renderStatus(statusEl, status);
});

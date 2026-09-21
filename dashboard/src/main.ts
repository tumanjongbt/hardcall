import { fetchEvents, fetchInsights, subscribeEvents } from "./api";
import { INSIGHTS_POLL_MS, SEARCH_DEBOUNCE_MS } from "./config";
import { debounce } from "./debounce";
import { filterEvents, paginate } from "./query";
import { findInsight } from "./insights";
import {
  renderChannels,
  renderFeed,
  renderInsightDetail,
  renderInsights,
  renderInsightsMeta,
  renderMeta,
  renderPagination,
  renderPerPage,
  renderStatus,
  renderTabs,
} from "./render";
import type { DashboardTab, EventRow, InsightRow, StreamStatus, ViewState } from "./types";
import { hrefForState, parseViewState } from "./url-state";

const tabsEl = must("#tabs");
const eventsViewEl = must("#events-view");
const insightsViewEl = must("#insights-view");
const channelsEl = must("#channel-filters");
const perPageEl = must("#per-page");
const searchEl = must<HTMLInputElement>("#search");
const statusEl = must("#stream-status");
const metaEl = must("#feed-meta");
const feedEl = must("#feed");
const paginationEl = must("#pagination");
const insightsEl = must("#insights");
const insightsMetaEl = must("#insights-meta");
const insightDetailEl = must("#insight-detail");

let allEvents: EventRow[] = [];
let insights: InsightRow[] = [];
let view = parseViewState(location.search);
let freshIds = new Set<string>();
let status: StreamStatus = "connecting";
let loadError: string | null = null;
let loading = true;
let insightsError: string | null = null;
let insightsLoading = true;
let insightsLoadedAt: string | null = null;

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

function insightsModel() {
  return {
    insights,
    loading: insightsLoading,
    loadError: insightsError,
    lastLoadedAt: insightsLoadedAt,
    openId: view.tab === "insights" ? view.insight : null,
  };
}

function paint(): void {
  const model = currentModel();
  renderTabs(tabsEl, model.view.tab, setTab);
  eventsViewEl.hidden = model.view.tab !== "events";
  insightsViewEl.hidden = model.view.tab !== "insights";
  renderChannels(channelsEl, model.view, setChannel);
  renderPerPage(perPageEl, model.view, setPerPage);
  renderStatus(statusEl, model.status);
  renderMeta(metaEl, model);
  renderFeed(feedEl, model);
  renderPagination(paginationEl, model, setPage);
  renderInsights(insightsEl, insightsModel(), toggleInsight);
  renderInsightsMeta(insightsMetaEl, insightsModel());
  renderInsightDetail(
    insightDetailEl,
    view.tab === "insights" ? findInsight(insights, view.insight) : null,
    closeInsight
  );
  if (searchEl.value !== model.view.q && document.activeElement !== searchEl) {
    searchEl.value = model.view.q;
  }
}

function pushView(next: ViewState): void {
  view = next;
  history.pushState(view, "", hrefForState(view, location.pathname));
  paint();
}

function setTab(tab: DashboardTab): void {
  if (view.tab === tab) return;
  pushView({ ...view, tab, insight: tab === "insights" ? view.insight : null });
}

function toggleInsight(id: string): void {
  if (view.insight === id) {
    closeInsight();
    return;
  }
  pushView({ ...view, tab: "insights", insight: id });
}

function closeInsight(): void {
  if (!view.insight) return;
  const id = view.insight;
  pushView({ ...view, insight: null });
  const card = insightsEl.querySelector<HTMLButtonElement>(
    `[data-insight-id="${CSS.escape(id)}"] .kpi-card, button.kpi-card[data-insight-id="${CSS.escape(id)}"]`
  );
  card?.focus();
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && view.insight) {
    event.preventDefault();
    closeInsight();
  }
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

function errorMessage(err: unknown, kind: "events" | "insights"): string {
  const statusCode =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status: number }).status)
      : 0;
  if (statusCode === 404) {
    return kind === "insights"
      ? "GET /api/insights is not on this API yet. After merge, Render must redeploy and migrate."
      : "GET /api/events is not on this API yet. After merge, Render must redeploy. Live SSE still works once history is available.";
  }
  return err instanceof Error ? err.message : `Failed to load ${kind}.`;
}

async function loadHistory(): Promise<void> {
  loading = true;
  loadError = null;
  paint();
  try {
    allEvents = await fetchEvents();
  } catch (err) {
    allEvents = [];
    loadError = errorMessage(err, "events");
  } finally {
    loading = false;
    paint();
  }
}

async function loadInsights(): Promise<void> {
  const hadRows = insights.length > 0;
  if (!hadRows) insightsLoading = true;
  insightsError = null;
  paint();
  try {
    insights = await fetchInsights();
    insightsLoadedAt = new Date().toISOString();
    if (view.insight && !findInsight(insights, view.insight)) {
      view = { ...view, insight: null };
      history.replaceState(view, "", hrefForState(view, location.pathname));
    }
  } catch (err) {
    if (!hadRows) insights = [];
    insightsError = errorMessage(err, "insights");
  } finally {
    insightsLoading = false;
    paint();
  }
}

searchEl.value = view.q;
history.replaceState(view, "", hrefForState(view, location.pathname));
paint();
void loadHistory();
void loadInsights();
window.setInterval(() => {
  void loadInsights();
}, INSIGHTS_POLL_MS);
subscribeEvents(prependLive, (next) => {
  status = next;
  renderStatus(statusEl, status);
});

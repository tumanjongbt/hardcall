import { fetchEvents, fetchInsights, fetchMeta, postEvent, postInsight, subscribeEvents } from "./api";
import { renderDecisionCharts, teardownDecisionCharts } from "./charts/decisionCharts";
import { renderCharts, teardownCharts } from "./charts/renderCharts";
import { renderChartFilters } from "./charts/controls";
import { channelDistribution, eventsInRange } from "./charts/transforms";
import { apiBase, INSIGHTS_POLL_MS, PLAYGROUND_TOAST_MS, SEARCH_DEBOUNCE_MS } from "./config";
import { debounce } from "./debounce";
import { lensDecision, renderFeedStrip, renderLensBar, renderPaths } from "./decisionRender";
import { findInsight, sortInsights } from "./insights";
import {
  buildEventPayload,
  createdEventSummary,
  fetchSnippet,
  isStakeholderTag,
  normalizeChannel,
  type PlaygroundForm,
} from "./playground";
import {
  EMOJI_PRESETS,
  cycleSample,
  resetPlaygroundForm,
  sampleStatusLabel,
} from "./playgroundSamples";
import { isLiveEventSource, provenanceCounts } from "./provenance";
import { filterEvents, paginate } from "./query";
import {
  renderChannels,
  renderFeed,
  renderFetchPreview,
  renderInsightDetail,
  renderInsights,
  renderInsightsMeta,
  renderMeta,
  renderPagination,
  renderPerPage,
  renderPlaygroundError,
  renderPlaygroundMeta,
  renderPlaygroundSampleStatus,
  renderPlaygroundToast,
  renderStatus,
  renderTabs,
  renderAdminStatus,
  renderAttribution,
} from "./render";
import {
  emptySeedProgress,
  ingestSeed,
  isJsonFile,
  parseSeedJson,
  type SeedProgress,
} from "./seed";
import type { AudienceLens, ChartRange, DashboardTab, EventRow, ForecastHorizon, InsightRow, Outlook, StreamStatus, ViewState } from "./types";
import { hrefForState, parseCip, parseState, parseViewState } from "./url-state";
import {
  buildFeedStrip,
  buildPaths,
  decisionTiles,
  emptyWarehouse,
  loadWarehouse,
  mergeInsightRows,
  tilesForLens,
  tilesToInsights,
  visibleApiInsights,
  warehouseGaps,
  type DecisionFilters,
  type WarehouseSnapshot,
} from "./warehouse";

const lensEl = must("#lens-switch");
const lensDecisionEl = must("#lens-decision");
const feedsEl = must("#feeds");
const pathsEl = must("#paths");
const decisionChartsEl = must("#decision-charts");
const tabsEl = must("#tabs");
const heroEl = must("#hero");
const eventsViewEl = must("#events-view");
const chartsViewEl = must("#charts-view");
const chartsHeadingEl = must("#charts-heading");
const chartsDecisionEl = must("#charts-decision");
const chartFiltersEl = must("#chart-filters");
const chartsEl = must("#charts");
const insightsViewEl = must("#insights-view");
const eventFiltersEl = must("#event-filters");
const perPageBlockEl = must("#per-page-block");
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
const playgroundViewEl = must("#playground-view");
const playgroundFormEl = must<HTMLFormElement>("#playground-form");
const playgroundFetchEl = must("#playground-fetch");
const playgroundErrorEl = must("#playground-error");
const playgroundToastEl = must("#playground-toast");
const playgroundMetaEl = must("#playground-meta");
const playgroundSubmitEl = must<HTMLButtonElement>("#playground-submit");
const playgroundChannelEl = must<HTMLSelectElement>("#playground-channel");
const playgroundTitleEl = must<HTMLInputElement>("#playground-title");
const playgroundDescriptionEl = must<HTMLTextAreaElement>("#playground-description");
const playgroundEmojiEl = must<HTMLInputElement>("#playground-emoji");
const playgroundEmojiChipsEl = must("#playground-emoji-chips");
const playgroundFillSampleEl = must<HTMLButtonElement>("#playground-fill-sample");
const playgroundResetEl = must<HTMLButtonElement>("#playground-reset");
const playgroundCopyEl = must<HTMLButtonElement>("#playground-copy");
const playgroundSampleStatusEl = must("#playground-sample-status");
const adminViewEl = must("#admin-view");
const adminDropEl = must("#admin-drop");
const adminFileEl = must<HTMLInputElement>("#admin-file");
const adminChooseEl = must<HTMLButtonElement>("#admin-choose");
const adminStatusEl = must("#admin-status");
const adminToastEl = must("#admin-toast");
const attributionEl = must("#attribution");

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
let playgroundSubmitting = false;
let playgroundError: string | null = null;
let playgroundToast: { id: string; title: string } | null = null;
let playgroundToastTimer: number | null = null;
let playgroundSampleIndex: number | null = null;
let playgroundCopyTimer: number | null = null;
let seedProgress: SeedProgress = emptySeedProgress();
let adminToastTimer: number | null = null;
let allowDemo = import.meta.env.VITE_HARDCALL_ALLOW_DEMO !== "false";
let warehouseFetchedAt: string | null = null;
let warehouse: WarehouseSnapshot = emptyWarehouse();
let warehouseLoading = true;

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}

function decisionFilters(): DecisionFilters {
  return {
    channel: view.channel,
    state: view.state,
    cip: view.cip,
    outlook: view.outlook,
    lens: view.lens,
  };
}

function currentModel() {
  const filtered = filterEvents(allEvents, view.channel, view.q, view.lens);
  const chartFiltered = filtered;
  const page = paginate(filtered, view.page, view.perPage);
  if (page.page !== view.page) {
    view = { ...view, page: page.page };
    history.replaceState(view, "", hrefForState(view, location.pathname));
  }
  const counts = provenanceCounts(allEvents);
  return {
    events: page.items,
    filtered,
    chartFiltered,
    freshIds,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    view,
    status,
    loadError,
    loading,
    liveCount: counts.live,
    demoCount: counts.demo,
  };
}

function insightsModel() {
  const filters = decisionFilters();
  const apiRows = visibleApiInsights(insights, allowDemo);
  const derived = warehouseLoading
    ? []
    : tilesToInsights(tilesForLens(decisionTiles(warehouse, filters), view.lens));
  const merged = sortInsights(mergeInsightRows(apiRows, derived));
  const demoNote =
    allowDemo && apiRows.some((row) => !isLiveEventSource(row.source))
      ? "Demo KPI cards are admin seed, playground, or CLI values. They are not production warehouse data."
      : null;
  return {
    insights: merged,
    loading: (insightsLoading || warehouseLoading) && merged.length === 0,
    loadError: insightsError,
    lastLoadedAt: insightsLoadedAt,
    openId: view.tab === "insights" ? view.insight : null,
    demoNote,
  };
}

function paint(): void {
  if (
    !allowDemo &&
    (view.tab === "playground" || view.tab === "admin")
  ) {
    view = { ...view, tab: "events" };
    history.replaceState(view, "", hrefForState(view, location.pathname));
  }
  const model = currentModel();
  renderTabs(tabsEl, model.view.tab, setTab, { allowDemo });
  eventsViewEl.hidden = model.view.tab !== "events";
  chartsViewEl.hidden = model.view.tab !== "charts";
  chartsHeadingEl.hidden = model.view.tab !== "charts";
  heroEl.hidden = model.view.tab !== "events";
  chartsDecisionEl.textContent = lensDecision(view);
  lensDecisionEl.textContent = lensDecision(view);
  renderLensBar(lensEl, view, {
    onLens: setLens,
    onState: (value) => commitState(value),
    onCip: (value) => commitCip(value),
    onOutlook: setOutlook,
  });
  renderFeedStrip(
    feedsEl,
    warehouseLoading
      ? null
      : buildFeedStrip(warehouse, { latestFetchedAt: warehouseFetchedAt, events: allEvents }),
    warehouseLoading
  );
  const showPaths = view.tab === "events" || view.tab === "insights" || view.tab === "charts";
  pathsEl.hidden = !showPaths;
  if (showPaths) {
    renderPaths(pathsEl, {
      loading: warehouseLoading,
      rows: warehouseLoading ? [] : buildPaths(warehouse, decisionFilters()),
      gaps: warehouseLoading ? [] : warehouseGaps(warehouse),
    });
  }
  insightsViewEl.hidden = model.view.tab !== "insights";
  playgroundViewEl.hidden = model.view.tab !== "playground";
  adminViewEl.hidden = model.view.tab !== "admin";
  eventFiltersEl.hidden =
    model.view.tab === "insights" ||
    model.view.tab === "playground" ||
    model.view.tab === "admin";
  eventsViewEl.setAttribute("aria-busy", model.loading ? "true" : "false");
  chartsEl.setAttribute("aria-busy", model.loading ? "true" : "false");
  insightsEl.setAttribute(
    "aria-busy",
    insightsLoading && insights.length === 0 ? "true" : "false"
  );
  perPageBlockEl.hidden = model.view.tab !== "events";
  renderChannels(channelsEl, model.view, setChannel);
  renderPerPage(perPageEl, model.view, setPerPage);
  renderStatus(statusEl, model.status, {
    live: model.liveCount,
    demo: model.demoCount,
  });
  renderMeta(metaEl, model);
  renderFeed(feedEl, model);
  renderPagination(paginationEl, model, setPage);
  if (model.view.tab === "charts") {
    const now = new Date();
    const volumes = Object.fromEntries(
      channelDistribution(
        eventsInRange(model.chartFiltered, now, model.view.range)
      ).map((slice) => [slice.channel, slice.count])
    );
    renderChartFilters(
      chartFiltersEl,
      model.view,
      {
        onRange: setRange,
        onToggleCompare: toggleCompare,
      },
      { volumes: model.loading ? undefined : volumes }
    );
    renderDecisionCharts(decisionChartsEl, {
      snapshot: warehouse,
      filters: decisionFilters(),
      loading: warehouseLoading,
    });
    renderCharts(
      chartsEl,
      {
        events: model.chartFiltered,
        view: model.view,
        loading: model.loading,
        loadError: model.loadError,
      },
      now,
      { onForecast: setForecast }
    );
  } else {
    teardownCharts(chartsEl);
    teardownDecisionCharts(decisionChartsEl);
  }
  const insightView = insightsModel();
  renderInsights(insightsEl, insightView, toggleInsight);
  renderInsightsMeta(insightsMetaEl, insightView);
  renderInsightDetail(
    insightDetailEl,
    view.tab === "insights" ? findInsight(insightView.insights, view.insight) : null,
    closeInsight
  );
  if (model.view.tab === "playground") paintPlayground();
  if (model.view.tab === "admin") paintAdmin();
  renderAttribution(attributionEl, {
    allowDemo,
    fetchedAt: warehouseFetchedAt,
  });
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
  if (!allowDemo && (tab === "playground" || tab === "admin")) return;
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

function setLens(lens: AudienceLens | null): void {
  if (view.lens === lens) return;
  pushView({ ...view, lens, page: 1 });
}

function setOutlook(outlook: Outlook): void {
  if (view.outlook === outlook) return;
  pushView({ ...view, outlook });
}

const commitState = debounce((value: string) => {
  const state = parseState(value);
  if (state === view.state) return;
  pushView({ ...view, state, page: 1 });
}, SEARCH_DEBOUNCE_MS);

const commitCip = debounce((value: string) => {
  const cip = parseCip(value);
  if (cip === view.cip) return;
  pushView({ ...view, cip, page: 1 });
}, SEARCH_DEBOUNCE_MS);

function setRange(range: ChartRange): void {
  if (view.range === range) return;
  pushView({ ...view, range });
}

function setForecast(forecast: ForecastHorizon): void {
  if (view.forecast === forecast) return;
  pushView({ ...view, forecast });
}

function toggleCompare(channel: string): void {
  const selected = view.compare.filter((item) => item !== channel);
  if (view.compare.includes(channel)) {
    pushView({ ...view, compare: selected });
    return;
  }
  if (view.compare.length >= 2) {
    pushView({ ...view, compare: [view.compare[1] ?? channel, channel] });
    return;
  }
  pushView({ ...view, compare: [...view.compare, channel] });
}

function setPerPage(perPage: ViewState["perPage"]): void {
  if (view.perPage === perPage) return;
  pushView({ ...view, perPage, page: 1 });
}

function setPage(page: number): void {
  if (page === view.page) return;
  pushView({ ...view, page });
}

function readPlaygroundForm(): PlaygroundForm {
  const tags = [
    ...playgroundFormEl.querySelectorAll<HTMLInputElement>('input[name="tags"]:checked'),
  ]
    .map((input) => input.value)
    .filter(isStakeholderTag);
  return {
    channel: normalizeChannel(playgroundChannelEl.value),
    title: playgroundTitleEl.value,
    description: playgroundDescriptionEl.value,
    emoji: playgroundEmojiEl.value,
    tags,
  };
}

function writePlaygroundForm(form: PlaygroundForm): void {
  playgroundChannelEl.value = form.channel;
  playgroundTitleEl.value = form.title;
  playgroundDescriptionEl.value = form.description;
  playgroundEmojiEl.value = form.emoji;
  for (const input of playgroundFormEl.querySelectorAll<HTMLInputElement>(
    'input[name="tags"]'
  )) {
    input.checked = isStakeholderTag(input.value) && form.tags.includes(input.value);
  }
}

function currentFetchSource(): string {
  return fetchSnippet(apiBase(), buildEventPayload(readPlaygroundForm()));
}

function paintEmojiChipState(): void {
  const current = playgroundEmojiEl.value.trim();
  for (const button of playgroundEmojiChipsEl.querySelectorAll<HTMLButtonElement>(
    "[data-emoji]"
  )) {
    const active = button.dataset.emoji === current;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function mountEmojiChips(): void {
  playgroundEmojiChipsEl.replaceChildren();
  for (const emoji of EMOJI_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip chip--emoji";
    button.textContent = emoji;
    button.dataset.emoji = emoji;
    button.setAttribute("aria-label", `Use icon ${emoji}`);
    button.addEventListener("click", () => {
      playgroundEmojiEl.value = emoji;
      paintPlayground();
    });
    playgroundEmojiChipsEl.append(button);
  }
}

function paintPlayground(): void {
  const origin = apiBase();
  renderPlaygroundMeta(playgroundMetaEl, origin);
  renderPlaygroundSampleStatus(
    playgroundSampleStatusEl,
    sampleStatusLabel(playgroundSampleIndex)
  );
  renderFetchPreview(playgroundFetchEl, currentFetchSource());
  renderPlaygroundError(playgroundErrorEl, playgroundError);
  renderPlaygroundToast(playgroundToastEl, playgroundToast, dismissPlaygroundToast);
  paintEmojiChipState();
  playgroundSubmitEl.disabled = playgroundSubmitting;
  playgroundSubmitEl.setAttribute("aria-busy", playgroundSubmitting ? "true" : "false");
  playgroundSubmitEl.textContent = playgroundSubmitting ? "Submitting…" : "Submit to API";
}

function fillPlaygroundSample(): void {
  const next = cycleSample(playgroundSampleIndex);
  playgroundSampleIndex = next.index;
  writePlaygroundForm(next.form);
  playgroundError = null;
  paintPlayground();
}

function resetPlayground(): void {
  playgroundSampleIndex = null;
  writePlaygroundForm(resetPlaygroundForm());
  playgroundError = null;
  dismissPlaygroundToast();
  paintPlayground();
}

async function copyFetchSnippet(): Promise<void> {
  const source = currentFetchSource();
  try {
    await navigator.clipboard.writeText(source);
    playgroundCopyEl.textContent = "Copied";
  } catch {
    playgroundCopyEl.textContent = "Copy failed";
  }
  if (playgroundCopyTimer !== null) window.clearTimeout(playgroundCopyTimer);
  playgroundCopyTimer = window.setTimeout(() => {
    playgroundCopyEl.textContent = "Copy";
    playgroundCopyTimer = null;
  }, 1600);
}

function dismissPlaygroundToast(): void {
  playgroundToast = null;
  if (playgroundToastTimer !== null) {
    window.clearTimeout(playgroundToastTimer);
    playgroundToastTimer = null;
  }
  renderPlaygroundToast(playgroundToastEl, null, dismissPlaygroundToast);
}

function showPlaygroundToast(summary: { id: string; title: string }): void {
  playgroundToast = summary;
  if (playgroundToastTimer !== null) window.clearTimeout(playgroundToastTimer);
  playgroundToastTimer = window.setTimeout(() => {
    dismissPlaygroundToast();
  }, PLAYGROUND_TOAST_MS);
  renderPlaygroundToast(playgroundToastEl, playgroundToast, dismissPlaygroundToast);
}

playgroundFormEl.addEventListener("input", () => {
  if (view.tab === "playground") {
    renderFetchPreview(playgroundFetchEl, currentFetchSource());
    paintEmojiChipState();
  }
});
playgroundFormEl.addEventListener("change", () => {
  if (view.tab === "playground") {
    renderFetchPreview(playgroundFetchEl, currentFetchSource());
    paintEmojiChipState();
  }
});

playgroundFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitPlayground();
});

playgroundFillSampleEl.addEventListener("click", () => {
  fillPlaygroundSample();
});

playgroundResetEl.addEventListener("click", () => {
  resetPlayground();
});

playgroundCopyEl.addEventListener("click", () => {
  void copyFetchSnippet();
});

function paintAdmin(): void {
  renderAdminStatus(adminStatusEl, seedProgress);
  const running = seedProgress.running;
  adminDropEl.classList.toggle("is-disabled", running);
  adminDropEl.setAttribute("aria-disabled", running ? "true" : "false");
  adminChooseEl.disabled = running;
  adminFileEl.disabled = running;
}

function showAdminToast(message: string): void {
  adminToastEl.hidden = false;
  adminToastEl.replaceChildren();
  const card = document.createElement("div");
  card.className = "toast__card";
  const kicker = document.createElement("p");
  kicker.className = "toast__kicker";
  kicker.textContent = "Seed complete";
  const title = document.createElement("p");
  title.className = "toast__title";
  title.textContent = message;
  card.append(kicker, title);
  adminToastEl.append(card);
  if (adminToastTimer !== null) window.clearTimeout(adminToastTimer);
  adminToastTimer = window.setTimeout(() => {
    adminToastEl.hidden = true;
    adminToastEl.replaceChildren();
    adminToastTimer = null;
  }, PLAYGROUND_TOAST_MS);
}

async function ingestJsonFile(file: File): Promise<void> {
  if (seedProgress.running) return;
  if (!isJsonFile(file)) {
    seedProgress = {
      ...emptySeedProgress(),
      fileName: file.name,
      parseError: "Only .json files are accepted.",
    };
    paintAdmin();
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    seedProgress = {
      ...emptySeedProgress(),
      fileName: file.name,
      parseError: "Could not read that file.",
    };
    paintAdmin();
    return;
  }
  const parsed = parseSeedJson(text);
  if (!parsed.ok) {
    seedProgress = {
      ...emptySeedProgress(),
      fileName: file.name,
      parseError: parsed.error,
    };
    paintAdmin();
    return;
  }
  seedProgress = {
    ...emptySeedProgress(),
    running: true,
    fileName: file.name,
    total: parsed.value.events.length + parsed.value.insights.length,
  };
  paintAdmin();
  const result = await ingestSeed(parsed.value, {
    postEvent,
    postInsight,
    onProgress(patch) {
      seedProgress = { ...seedProgress, ...patch };
      paintAdmin();
    },
  });
  if (result.eventsOk > 0 || result.insightsOk > 0) {
    await loadHistory();
    await loadInsights();
  }
  if (result.errors.length === 0 && seedProgress.success) {
    showAdminToast(seedProgress.success);
  }
  paintAdmin();
}

adminChooseEl.addEventListener("click", () => {
  if (seedProgress.running) return;
  adminFileEl.click();
});

adminFileEl.addEventListener("change", () => {
  const file = adminFileEl.files?.[0];
  adminFileEl.value = "";
  if (file) void ingestJsonFile(file);
});

adminDropEl.addEventListener("dragenter", (event) => {
  event.preventDefault();
  if (!seedProgress.running) adminDropEl.classList.add("is-over");
});
adminDropEl.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!seedProgress.running) adminDropEl.classList.add("is-over");
});
adminDropEl.addEventListener("dragleave", () => {
  adminDropEl.classList.remove("is-over");
});
adminDropEl.addEventListener("drop", (event) => {
  event.preventDefault();
  adminDropEl.classList.remove("is-over");
  if (seedProgress.running) return;
  const file = event.dataTransfer?.files?.[0];
  if (file) void ingestJsonFile(file);
});

async function submitPlayground(): Promise<void> {
  if (playgroundSubmitting) return;
  playgroundSubmitting = true;
  playgroundError = null;
  paintPlayground();
  const payload = buildEventPayload(readPlaygroundForm());
  try {
    const row = await postEvent(payload);
    showPlaygroundToast(createdEventSummary(row));
    prependLive(row);
  } catch (err) {
    playgroundError = err instanceof Error ? err.message : "Request failed.";
  } finally {
    playgroundSubmitting = false;
    paintPlayground();
  }
}

const commitSearch = debounce((q: string) => {
  if (q === view.q) return;
  pushView({ ...view, q, page: 1 });
}, SEARCH_DEBOUNCE_MS);

searchEl.addEventListener("input", () => {
  commitSearch(searchEl.value.trim());
});

tabsEl.addEventListener("keydown", (event) => {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const buttons = [...tabsEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const current = buttons.findIndex((button) => button === document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  let next = current;
  if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
  if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = buttons.length - 1;
  const target = buttons[next];
  const tab = target?.dataset.tab as DashboardTab | undefined;
  if (!tab) return;
  target.focus();
  setTab(tab);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && view.insight) {
    event.preventDefault();
    closeInsight();
  }
});

window.addEventListener("popstate", () => {
  commitSearch.cancel();
  commitState.cancel();
  commitCip.cancel();
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
    if (
      view.insight &&
      !view.insight.startsWith("wh:") &&
      !findInsight(insights, view.insight)
    ) {
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

async function loadWarehouseRows(): Promise<void> {
  warehouseLoading = true;
  paint();
  try {
    warehouse = await loadWarehouse(apiBase());
  } catch {
    warehouse = emptyWarehouse();
  } finally {
    warehouseLoading = false;
    paint();
  }
}

async function loadMeta(): Promise<void> {
  try {
    const meta = await fetchMeta();
    allowDemo = meta.allow_demo;
    warehouseFetchedAt = meta.warehouse?.latest_fetched_at ?? null;
  } catch {
    // Keep the Vite default; paint still works if /api/meta is not deployed yet.
  }
  paint();
}

searchEl.value = view.q;
history.replaceState(view, "", hrefForState(view, location.pathname));
mountEmojiChips();
writePlaygroundForm(resetPlaygroundForm());
paint();
void loadMeta();
void loadHistory();
void loadInsights();
void loadWarehouseRows();
window.setInterval(() => {
  void loadInsights();
}, INSIGHTS_POLL_MS);
subscribeEvents(prependLive, (next) => {
  status = next;
  const counts = provenanceCounts(allEvents);
  renderStatus(statusEl, status, counts);
});

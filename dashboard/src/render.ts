import { CHANNELS, CHANNEL_LABELS, channelLabel, tagLabel } from "./channels";
import { insightTone } from "./insights";
import type { DashboardTab, EventRow, InsightRow, StreamStatus, ViewState } from "./types";

export type FeedModel = {
  events: EventRow[];
  freshIds: ReadonlySet<string>;
  total: number;
  page: number;
  pageCount: number;
  view: ViewState;
  status: StreamStatus;
  loadError: string | null;
  loading: boolean;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function renderChannels(
  root: HTMLElement,
  view: ViewState,
  onChannel: (channel: string | null) => void
): void {
  root.replaceChildren();
  const all = el("button", "chip", "All channels");
  all.type = "button";
  all.dataset.channel = "";
  all.setAttribute("aria-pressed", view.channel === null ? "true" : "false");
  if (view.channel === null) all.classList.add("is-active");
  all.addEventListener("click", () => onChannel(null));
  root.append(all);

  for (const channel of CHANNELS) {
    const button = el("button", `chip chip--${channel}`, CHANNEL_LABELS[channel]);
    button.type = "button";
    button.dataset.channel = channel;
    button.setAttribute("aria-pressed", view.channel === channel ? "true" : "false");
    if (view.channel === channel) button.classList.add("is-active");
    button.addEventListener("click", () => onChannel(channel));
    root.append(button);
  }
}

export function renderPerPage(
  root: HTMLElement,
  view: ViewState,
  onPerPage: (perPage: ViewState["perPage"]) => void
): void {
  root.replaceChildren();
  const options: Array<{ value: ViewState["perPage"]; label: string }> = [
    { value: 50, label: "50 / page" },
    { value: 100, label: "100 / page" },
    { value: "all", label: "All" },
  ];
  for (const option of options) {
    const button = el("button", "chip chip--compact", option.label);
    button.type = "button";
    button.dataset.perPage = String(option.value);
    button.setAttribute("aria-pressed", view.perPage === option.value ? "true" : "false");
    if (view.perPage === option.value) button.classList.add("is-active");
    button.addEventListener("click", () => onPerPage(option.value));
    root.append(button);
  }
}

export function renderStatus(root: HTMLElement, status: StreamStatus): void {
  root.replaceChildren();
  const pill = el("span", `live-pill live-pill--${status}`);
  const dot = el("span", "live-pill__dot");
  const label =
    status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Stream down";
  pill.append(dot, el("span", undefined, label));
  root.append(pill);
}

export function renderMeta(
  root: HTMLElement,
  model: FeedModel
): void {
  const channel = model.view.channel
    ? channelLabel(model.view.channel)
    : "All channels";
  const q = model.view.q ? ` · “${model.view.q}”` : "";
  root.textContent = model.loading
    ? "Loading feed…"
    : `${model.total} event${model.total === 1 ? "" : "s"} · ${channel}${q}`;
}

export function renderFeed(root: HTMLElement, model: FeedModel): void {
  root.replaceChildren();
  if (model.loading) {
    root.append(el("p", "empty", "Pulling the latest orbit…"));
    return;
  }
  if (model.loadError) {
    const box = el("div", "empty empty--error");
    box.append(el("p", "empty__title", "Could not load history"));
    box.append(el("p", undefined, model.loadError));
    root.append(box);
    return;
  }
  if (model.events.length === 0) {
    root.append(
      el("p", "empty", "No events match this filter. Try another channel or search.")
    );
    return;
  }

  const list = el("ol", "feed");
  for (const event of model.events) {
    list.append(renderCard(event, model.freshIds.has(event.id)));
  }
  root.append(list);
}

function renderCard(event: EventRow, fresh: boolean): HTMLLIElement {
  const card = el("li", "event-card");
  card.dataset.eventId = event.id;
  if (fresh) card.classList.add("is-fresh");

  const top = el("div", "event-card__top");
  const badge = el("span", `channel-badge channel-badge--${event.channel}`, channelLabel(event.channel));
  const time = el("time", "event-card__time", formatWhen(event.created_at));
  time.dateTime = event.created_at;
  top.append(badge, time);

  const titleRow = el("div", "event-card__title-row");
  if (event.emoji) titleRow.append(el("span", "event-card__emoji", event.emoji));
  titleRow.append(el("h2", "event-card__title", event.title));

  card.append(top, titleRow);
  if (event.description) {
    card.append(el("p", "event-card__body", event.description));
  }
  if (event.tags.length) {
    const tags = el("ul", "tag-list");
    for (const tag of event.tags) {
      tags.append(el("li", "tag", tagLabel(tag)));
    }
    card.append(tags);
  }
  return card;
}

export type InsightsModel = {
  insights: InsightRow[];
  loading: boolean;
  loadError: string | null;
  lastLoadedAt: string | null;
};

export function renderTabs(
  root: HTMLElement,
  tab: DashboardTab,
  onTab: (tab: DashboardTab) => void
): void {
  root.replaceChildren();
  const options: Array<{ value: DashboardTab; label: string }> = [
    { value: "events", label: "Events" },
    { value: "insights", label: "Market Insights" },
  ];
  for (const option of options) {
    const button = el("button", "tab", option.label);
    button.type = "button";
    button.dataset.tab = option.value;
    button.setAttribute("aria-pressed", tab === option.value ? "true" : "false");
    if (tab === option.value) button.classList.add("is-active");
    button.addEventListener("click", () => onTab(option.value));
    root.append(button);
  }
}

export function renderInsights(root: HTMLElement, model: InsightsModel): void {
  root.replaceChildren();
  if (model.loading && model.insights.length === 0) {
    root.append(el("p", "empty", "Pulling market signals…"));
    return;
  }
  if (model.loadError && model.insights.length === 0) {
    const box = el("div", "empty empty--error");
    box.append(el("p", "empty__title", "Could not load insights"));
    box.append(el("p", undefined, model.loadError));
    root.append(box);
    return;
  }
  if (model.insights.length === 0) {
    root.append(
      el("p", "empty", "No market insights yet. POST /api/insight to publish a KPI.")
    );
    return;
  }

  const grid = el("ul", "kpi-grid");
  for (const insight of model.insights) {
    grid.append(renderKpiCard(insight));
  }
  root.append(grid);
}

function renderKpiCard(insight: InsightRow): HTMLLIElement {
  const tone = insightTone(insight.value);
  const card = el("li", `kpi-card kpi-card--${tone}`);
  card.dataset.insightId = insight.id;
  card.append(el("p", "kpi-card__title", insight.title));
  card.append(el("p", "kpi-card__value", insight.value));
  const time = el("time", "kpi-card__when", `Updated ${formatWhen(insight.updated_at)}`);
  time.dateTime = insight.updated_at;
  card.append(time);
  return card;
}

export function renderInsightsMeta(root: HTMLElement, model: InsightsModel): void {
  if (model.loading && model.insights.length === 0) {
    root.textContent = "Loading insights…";
    return;
  }
  const count = `${model.insights.length} KPI${model.insights.length === 1 ? "" : "s"}`;
  const refreshed = model.lastLoadedAt ? ` · refreshed ${formatWhen(model.lastLoadedAt)}` : "";
  root.textContent = `${count}${refreshed}`;
}

export function renderPagination(
  root: HTMLElement,
  model: FeedModel,
  onPage: (page: number) => void
): void {
  root.replaceChildren();
  if (model.view.perPage === "all" || model.pageCount <= 1) {
    root.hidden = true;
    return;
  }
  root.hidden = false;

  const prev = el("button", "chip chip--compact", "Previous");
  prev.type = "button";
  prev.disabled = model.page <= 1;
  prev.addEventListener("click", () => onPage(model.page - 1));

  const next = el("button", "chip chip--compact", "Next");
  next.type = "button";
  next.disabled = model.page >= model.pageCount;
  next.addEventListener("click", () => onPage(model.page + 1));

  const label = el(
    "p",
    "pagination__status",
    `Page ${model.page} of ${model.pageCount}`
  );

  root.append(prev, label, next);
}

import { CHANNELS, CHANNEL_LABELS, channelLabel, tagLabel } from "./channels";
import { insightDetailBody, insightTone } from "./insights";
import { highlightFetchHtml } from "./playground";
import {
  eventSourceBadge,
  eventStampKind,
  insightSourceBadge,
  pipeProvenanceNote,
  pipeStatusLabel,
  type SourceBadge,
} from "./provenance";
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
  liveCount: number;
  demoCount: number;
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

/** Shared loading / empty / error box so Events, Insights, and Charts match. */
export function statusBox(
  kind: "loading" | "error" | "empty",
  body: string,
  title?: string
): HTMLElement {
  if (kind === "loading") {
    const node = el("p", "empty empty--loading", body);
    node.setAttribute("role", "status");
    return node;
  }
  if (kind === "error") {
    const box = el("div", "empty empty--error");
    box.setAttribute("role", "alert");
    box.append(el("p", "empty__title", title ?? "Could not load"));
    box.append(el("p", undefined, body));
    return box;
  }
  if (!title) return el("p", "empty", body);
  const box = el("div", "empty");
  box.append(el("p", "empty__title", title));
  box.append(el("p", undefined, body));
  return box;
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

export function renderStatus(
  root: HTMLElement,
  status: StreamStatus,
  counts: { live: number; demo: number } = { live: 0, demo: 0 }
): void {
  root.replaceChildren();
  const label = pipeStatusLabel(status);
  const pill = el("span", `live-pill live-pill--${status}`);
  const dot = el("span", "live-pill__dot");
  pill.setAttribute("aria-label", `Stream ${label.toLowerCase()}`);
  pill.append(dot, el("span", undefined, label));
  root.append(pill);
  const note = pipeProvenanceNote(status, counts.live, counts.demo);
  if (note) {
    root.append(el("p", "live-pill__note", note));
  }
}

export function renderMeta(
  root: HTMLElement,
  model: FeedModel
): void {
  const channel = model.view.channel
    ? channelLabel(model.view.channel)
    : "All channels";
  const q = model.view.q ? ` · “${model.view.q}”` : "";
  const provenance =
    model.liveCount === 0 && model.demoCount === 0
      ? ""
      : model.liveCount === 0
        ? " · no live-source rows in this feed"
        : model.demoCount === 0
          ? ` · ${model.liveCount} live`
          : ` · ${model.liveCount} live · ${model.demoCount} demo`;
  root.textContent = model.loading
    ? "Loading feed…"
    : `${model.total} event${model.total === 1 ? "" : "s"} · ${channel}${q}${provenance}`;
}

export function renderFeed(root: HTMLElement, model: FeedModel): void {
  root.replaceChildren();
  if (model.loading) {
    root.append(statusBox("loading", "Pulling the latest orbit…"));
    return;
  }
  if (model.loadError) {
    root.append(statusBox("error", model.loadError, "Could not load history"));
    return;
  }
  if (model.events.length === 0) {
    root.append(
      statusBox("empty", "No events match this filter. Try another channel or search.")
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
  const badges = el("div", "event-card__badges");
  badges.append(
    el("span", `channel-badge channel-badge--${event.channel}`, channelLabel(event.channel))
  );
  badges.append(sourceBadgeEl(eventSourceBadge(event.source)));
  const stampKind = eventStampKind(event.fetched_at);
  const stampIso = stampKind === "fetched" && event.fetched_at ? event.fetched_at : event.created_at;
  const stampLabel = stampKind === "fetched" ? "Fetched" : "Posted";
  const time = el("time", "event-card__time", `${stampLabel} ${formatWhen(stampIso)}`);
  time.dateTime = stampIso;
  top.append(badges, time);

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
  if (event.source_url) {
    const link = document.createElement("a");
    link.className = "event-card__source";
    link.href = event.source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open source";
    card.append(link);
  }
  return card;
}

export type InsightsModel = {
  insights: InsightRow[];
  loading: boolean;
  loadError: string | null;
  lastLoadedAt: string | null;
  openId: string | null;
};

export function renderTabs(
  root: HTMLElement,
  tab: DashboardTab,
  onTab: (tab: DashboardTab) => void,
  opts: { allowDemo?: boolean } = {}
): void {
  root.replaceChildren();
  root.setAttribute("role", "tablist");
  const options: Array<{ value: DashboardTab; label: string }> = [
    { value: "events", label: "Events" },
    { value: "charts", label: "Charts" },
    { value: "insights", label: "Market Insights" },
  ];
  if (opts.allowDemo !== false) {
    options.push(
      { value: "playground", label: "Playground" },
      { value: "admin", label: "Admin" }
    );
  }
  for (const option of options) {
    const selected = tab === option.value;
    const button = el("button", "tab", option.label);
    button.type = "button";
    button.id = `tab-${option.value}`;
    button.dataset.tab = option.value;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.setAttribute("aria-controls", `${option.value}-view`);
    button.tabIndex = selected ? 0 : -1;
    if (selected) button.classList.add("is-active");
    button.addEventListener("click", () => onTab(option.value));
    root.append(button);
  }
}

export function renderInsights(
  root: HTMLElement,
  model: InsightsModel,
  onOpen?: (id: string) => void
): void {
  root.replaceChildren();
  if (model.loading && model.insights.length === 0) {
    root.append(statusBox("loading", "Pulling market signals…"));
    return;
  }
  if (model.loadError && model.insights.length === 0) {
    root.append(statusBox("error", model.loadError, "Could not load insights"));
    return;
  }
  if (model.insights.length === 0) {
    root.append(
      statusBox("empty", "No market insights yet. POST /api/insight to publish a KPI.")
    );
    return;
  }

  const grid = el("ul", "kpi-grid");
  for (const insight of model.insights) {
    grid.append(renderKpiCard(insight, model.openId, onOpen));
  }
  root.append(grid);
}

function renderKpiCard(
  insight: InsightRow,
  openId: string | null,
  onOpen?: (id: string) => void
): HTMLLIElement {
  const tone = insightTone(insight.value);
  const item = el("li", "kpi-grid__item");
  item.dataset.insightId = insight.id;

  const card = el("button", `kpi-card kpi-card--${tone}`);
  card.type = "button";
  card.dataset.insightId = insight.id;
  card.setAttribute("aria-haspopup", "dialog");
  card.setAttribute("aria-controls", "insight-drawer");
  const open = openId === insight.id;
  card.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) card.classList.add("is-open");
  const head = el("div", "kpi-card__head");
  head.append(sourceBadgeEl(insightSourceBadge(insight.source)));
  head.append(el("p", "kpi-card__title", insight.title));
  card.append(head);
  card.append(el("p", "kpi-card__value", insight.value));
  const time = el("time", "kpi-card__when", `Updated ${formatWhen(insight.updated_at)}`);
  time.dateTime = insight.updated_at;
  card.append(time);
  if (onOpen) {
    card.addEventListener("click", () => onOpen(insight.id));
  }
  item.append(card);
  return item;
}

export function renderInsightDetail(
  root: HTMLElement,
  insight: InsightRow | null,
  onClose: () => void
): void {
  if (!insight) {
    root.hidden = true;
    root.replaceChildren();
    delete root.dataset.insightId;
    document.body.classList.remove("has-insight-detail");
    return;
  }

  document.body.classList.add("has-insight-detail");
  root.hidden = false;
  const body = insightDetailBody(insight.detail);
  const sameOpen = root.dataset.insightId === insight.id && root.querySelector("#insight-drawer");

  if (sameOpen) {
    const title = root.querySelector("#insight-detail-title");
    const badge = root.querySelector(".insight-drawer .source-badge");
    const value = root.querySelector(".insight-drawer__value");
    const detail = root.querySelector(".insight-drawer__detail");
    const when = root.querySelector<HTMLTimeElement>(".insight-drawer__when");
    if (title) title.textContent = insight.title;
    if (badge) {
      const next = insightSourceBadge(insight.source);
      badge.className = `source-badge source-badge--${next.kind}`;
      badge.textContent = next.label;
    }
    if (value) value.textContent = insight.value;
    if (detail) {
      detail.classList.toggle("is-empty", body.empty);
      detail.textContent = body.text;
    }
    if (when) {
      when.dateTime = insight.updated_at;
      when.textContent = `Updated ${formatWhen(insight.updated_at)}`;
    }
    return;
  }

  root.dataset.insightId = insight.id;
  root.replaceChildren();

  const backdrop = el("div", "insight-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) onClose();
  });

  const drawer = el("div", "insight-drawer");
  drawer.id = "insight-drawer";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-labelledby", "insight-detail-title");

  const close = el("button", "insight-drawer__close", "Close");
  close.type = "button";
  close.addEventListener("click", onClose);

  const title = el("h2", "insight-drawer__title", insight.title);
  title.id = "insight-detail-title";
  const badge = sourceBadgeEl(insightSourceBadge(insight.source));
  const value = el("p", "insight-drawer__value", insight.value);
  const when = el("time", "insight-drawer__when", `Updated ${formatWhen(insight.updated_at)}`);
  when.dateTime = insight.updated_at;
  const detail = el("p", "insight-drawer__detail", body.text);
  if (body.empty) detail.classList.add("is-empty");

  drawer.append(close, title, badge, value, when, detail);
  if (insight.source_url) {
    const link = document.createElement("a");
    link.className = "insight-drawer__source";
    link.href = insight.source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open source";
    drawer.append(link);
  }
  backdrop.append(drawer);
  root.append(backdrop);
  close.focus();
}

export function renderInsightsMeta(root: HTMLElement, model: InsightsModel): void {
  if (model.loading && model.insights.length === 0) {
    root.textContent = "Loading insights…";
    return;
  }
  const count = `${model.insights.length} KPI${model.insights.length === 1 ? "" : "s"}`;
  const refreshed = model.lastLoadedAt ? ` · refreshed ${formatWhen(model.lastLoadedAt)}` : "";
  const failed =
    model.loadError && model.insights.length > 0 ? " · refresh failed" : "";
  root.textContent = `${count}${refreshed}${failed}`;
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
  prev.setAttribute("aria-label", "Previous page");
  prev.addEventListener("click", () => onPage(model.page - 1));

  const next = el("button", "chip chip--compact", "Next");
  next.type = "button";
  next.disabled = model.page >= model.pageCount;
  next.setAttribute("aria-label", "Next page");
  next.addEventListener("click", () => onPage(model.page + 1));

  const label = el(
    "p",
    "pagination__status",
    `Page ${model.page} of ${model.pageCount}`
  );

  root.append(prev, label, next);
}

export function renderFetchPreview(root: HTMLElement, source: string): void {
  root.innerHTML = highlightFetchHtml(source);
}

export function renderPlaygroundError(root: HTMLElement, message: string | null): void {
  if (!message) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.hidden = false;
  root.replaceChildren();
  root.append(el("p", "banner__title", "Request failed"));
  root.append(el("p", "banner__body", message));
}

export type PlaygroundToast = { id: string; title: string };

export function renderPlaygroundToast(
  root: HTMLElement,
  toast: PlaygroundToast | null,
  onDismiss: () => void
): void {
  if (!toast) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.hidden = false;
  root.replaceChildren();
  const card = el("div", "toast__card");
  card.append(el("p", "toast__kicker", "Event posted"));
  const heading = toast.title.trim() || "(untitled)";
  card.append(el("p", "toast__title", heading));
  card.append(el("p", "toast__id", `id ${toast.id}`));
  const close = el("button", "toast__close", "Dismiss");
  close.type = "button";
  close.addEventListener("click", onDismiss);
  card.append(close);
  root.append(card);
}

export function renderPlaygroundMeta(root: HTMLElement, apiOrigin: string): void {
  root.textContent = `POST ${apiOrigin.replace(/\/+$/, "")}/api/events`;
}

function sourceBadgeEl(badge: SourceBadge): HTMLSpanElement {
  return el("span", `source-badge source-badge--${badge.kind}`, badge.label);
}

export function renderPlaygroundSampleStatus(
  root: HTMLElement,
  label: string | null
): void {
  if (!label) {
    root.hidden = true;
    root.textContent = "";
    return;
  }
  root.hidden = false;
  root.textContent = label;
}

export type AdminSeedStatus = {
  running: boolean;
  fileName: string | null;
  total: number;
  done: number;
  current: string | null;
  eventsOk: number;
  insightsOk: number;
  errors: string[];
  success: string | null;
  parseError: string | null;
};

export function renderAdminStatus(root: HTMLElement, status: AdminSeedStatus): void {
  root.replaceChildren();
  const box = el("div", "seed-status");
  if (status.parseError) {
    box.append(el("p", "banner__title", "Could not read file"));
    box.append(el("p", "seed-status__line", status.parseError));
    root.append(box);
    return;
  }
  if (!status.running && !status.success && status.errors.length === 0 && !status.fileName) {
    return;
  }
  if (status.fileName) {
    box.append(el("p", "seed-status__line", `File: ${status.fileName}`));
  }
  if (status.total > 0) {
    const counts = `${status.done}/${status.total} posted · ${status.eventsOk} events · ${status.insightsOk} insights`;
    box.append(el("p", "seed-status__line", counts));
    const meter = el("div", "resilience-meter");
    meter.setAttribute("aria-hidden", "true");
    const fill = el("div", "resilience-meter__fill");
    const pct = Math.round((status.done / status.total) * 100);
    fill.style.width = `${pct}%`;
    meter.append(fill);
    box.append(meter);
  }
  if (status.current) {
    box.append(el("p", "seed-status__line", status.current));
  }
  if (status.success) {
    box.append(el("p", "seed-status__success", status.success));
  }
  if (status.errors.length) {
    box.append(el("p", "banner__title", `${status.errors.length} error${status.errors.length === 1 ? "" : "s"}`));
    const list = el("ul", "seed-status__errors");
    for (const error of status.errors) {
      list.append(el("li", undefined, error));
    }
    box.append(list);
  }
  root.append(box);
}

export function renderAttribution(
  root: HTMLElement,
  model: { allowDemo: boolean; fetchedAt: string | null }
): void {
  root.replaceChildren();
  const credit = el(
    "p",
    "site-footer__credit",
    "Data: U.S. Department of Education College Scorecard · U.S. Bureau of Labor Statistics OEWS · O*NET Database by USDOL/ETA (CC BY 4.0; O*NET® is a trademark of USDOL/ETA) · U.S. Department of Labor registered apprenticeship partner sponsors."
  );
  const mode = el(
    "p",
    "site-footer__mode",
    model.allowDemo
      ? "Staging/demo writes are enabled on this API."
      : "Production mode: seed, playground, and synthetic CLI writes are disabled. Live badges come only from server-side adapters."
  );
  root.append(credit, mode);
  if (model.fetchedAt) {
    root.append(el("p", "site-footer__asof", `Warehouse data as of ${formatWhen(model.fetchedAt)}`));
  }
}

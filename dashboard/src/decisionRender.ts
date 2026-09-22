import { AUDIENCE_LENSES, CHANNEL_LABELS, LENS_LABELS, channelLabel } from "./channels";
import { formatWhen } from "./render";
import type { AudienceLens, ViewState } from "./types";
import { LENS_DECISIONS, type FeedStrip, type PathEntry } from "./warehouse";

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

export type LensHandlers = {
  onLens: (lens: AudienceLens | null) => void;
  onState: (state: string) => void;
  onCip: (cip: string) => void;
  onOutlook: (outlook: ViewState["outlook"]) => void;
};

export function renderLensBar(root: HTMLElement, view: ViewState, handlers: LensHandlers): void {
  const active = document.activeElement;
  const typingState =
    active instanceof HTMLInputElement && active.id === "filter-state" ? active.value : null;
  const typingCip =
    active instanceof HTMLInputElement && active.id === "filter-cip" ? active.value : null;
  root.replaceChildren();

  const lensField = el("fieldset", "chart-filter");
  const legend = el("legend", "control-label", "Stakeholder lens");
  legend.id = "stakeholder-lens-label";
  const row = el("div", "chip-row");
  row.setAttribute("role", "radiogroup");
  row.setAttribute("aria-labelledby", "stakeholder-lens-label");
  const options: Array<{ id: AudienceLens | null; label: string }> = [
    { id: null, label: "All" },
    ...AUDIENCE_LENSES.map((lens) => ({ id: lens, label: LENS_LABELS[lens] })),
  ];
  for (const option of options) {
    const button = el("button", "chip chip--compact", option.label);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", view.lens === option.id ? "true" : "false");
    if (view.lens === option.id) button.classList.add("is-active");
    if (option.id) button.dataset.lens = option.id;
    button.addEventListener("click", () => handlers.onLens(option.id));
    row.append(button);
  }
  lensField.append(legend, row);

  const filters = el("div", "lens-filters");
  const stateLabel = el("label", "control-label", "State");
  stateLabel.htmlFor = "filter-state";
  const stateInput = el("input", "field field--compact") as HTMLInputElement;
  stateInput.id = "filter-state";
  stateInput.type = "search";
  stateInput.placeholder = "CA or California";
  stateInput.value = typingState ?? view.state ?? "";
  stateInput.autocomplete = "off";
  stateInput.addEventListener("input", () => handlers.onState(stateInput.value));

  const cipLabel = el("label", "control-label", "CIP / program");
  cipLabel.htmlFor = "filter-cip";
  const cipInput = el("input", "field field--compact") as HTMLInputElement;
  cipInput.id = "filter-cip";
  cipInput.type = "search";
  cipInput.placeholder = "11.07 or welding";
  cipInput.value = typingCip ?? view.cip ?? "";
  cipInput.autocomplete = "off";
  cipInput.addEventListener("input", () => handlers.onCip(cipInput.value));

  const outlook = el("div", "lens-outlook");
  const outlookLabel = el("span", "control-label", "Outlook");
  outlookLabel.id = "outlook-label";
  const outlookRow = el("div", "chip-row");
  outlookRow.setAttribute("role", "radiogroup");
  outlookRow.setAttribute("aria-labelledby", "outlook-label");
  const outlooks: Array<{ id: ViewState["outlook"]; label: string }> = [
    { id: null, label: "All outlooks" },
    { id: "grow", label: "Growing" },
    { id: "decline", label: "Declining" },
  ];
  for (const option of outlooks) {
    const button = el("button", "chip chip--compact", option.label);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", view.outlook === option.id ? "true" : "false");
    if (view.outlook === option.id) button.classList.add("is-active");
    button.addEventListener("click", () => handlers.onOutlook(option.id));
    outlookRow.append(button);
  }
  outlook.append(outlookLabel, outlookRow);

  const stateWrap = el("div", "lens-field");
  stateWrap.append(stateLabel, stateInput);
  const cipWrap = el("div", "lens-field");
  cipWrap.append(cipLabel, cipInput);
  filters.append(stateWrap, cipWrap, outlook);
  root.append(lensField, filters);

  if (typingState !== null) root.querySelector<HTMLInputElement>("#filter-state")?.focus();
  if (typingCip !== null) root.querySelector<HTMLInputElement>("#filter-cip")?.focus();
}

export function lensDecision(view: ViewState): string {
  return LENS_DECISIONS[view.lens ?? "all"];
}

export function renderFeedStrip(root: HTMLElement, strip: FeedStrip | null, loading: boolean): void {
  root.replaceChildren();
  const head = el("div", "feeds__head");
  head.append(el("h2", "feeds__title", "Feeds"));
  head.append(
    el(
      "p",
      "feeds__detail",
      loading
        ? "Checking live sources…"
        : strip?.detail ?? "Last pulled times appear when the API reports them."
    )
  );
  root.append(head);
  if (loading || !strip) {
    root.append(el("p", "empty empty--loading", "Looking up GET /api/feeds and warehouse rows…"));
    return;
  }
  const list = el("ul", "feed-strip");
  for (const card of strip.cards) {
    const item = el("li", "feed-card");
    item.dataset.feed = card.id;
    const badge = el(
      "span",
      card.live ? "source-badge source-badge--live" : "source-badge source-badge--demo",
      card.live ? "Live" : "Not pulled"
    );
    item.append(badge);
    item.append(el("p", "feed-card__label", card.label));
    if (card.fetchedAt) {
      const time = el("time", "feed-card__when", `Last pulled ${formatWhen(card.fetchedAt)}`);
      time.dateTime = card.fetchedAt;
      item.append(time);
    } else {
      item.append(el("p", "feed-card__when", "Last pulled —"));
    }
    item.append(el("p", "feed-card__note", card.note));
    if (card.count != null) {
      item.append(el("p", "feed-card__count", `${card.count} rows in this response`));
    }
    if (card.sourceUrl) {
      const link = el("a", "feed-card__link", "Source");
      link.href = card.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
    }
    const home = el("a", "feed-card__link feed-card__link--home", "Dataset home");
    home.href = card.homeUrl;
    home.target = "_blank";
    home.rel = "noopener noreferrer";
    item.append(home);
    list.append(item);
  }
  root.append(list);
}

export function renderPaths(
  root: HTMLElement,
  model: { loading: boolean; rows: PathEntry[]; gaps: string[] }
): void {
  root.replaceChildren();
  root.append(el("h2", "paths__title", "Paths in this pull"));
  root.append(
    el(
      "p",
      "paths__note",
      "Rows from the warehouse endpoints, mapped onto the five channels only when the payload says so. Empty means that field was not returned."
    )
  );
  if (model.loading) {
    root.append(el("p", "empty empty--loading", "Waiting for warehouse rows…"));
    return;
  }
  if (model.gaps.length && model.rows.length === 0) {
    const box = el("div", "empty");
    box.append(el("p", "empty__title", "No warehouse rows yet"));
    for (const gap of model.gaps) box.append(el("p", undefined, gap));
    root.append(box);
    return;
  }
  if (model.rows.length === 0) {
    root.append(el("p", "empty", "No warehouse rows match this channel, state, CIP, and outlook."));
    return;
  }
  const table = el("table", "paths-table");
  const caption = el("caption", "paths-table__caption", "Comparable paths returned by the API");
  const head = el("thead");
  const headRow = el("tr");
  for (const label of ["Channel", "Path", "Published fields", "Source", "Last pulled"]) {
    headRow.append(el("th", undefined, label));
  }
  head.append(headRow);
  const body = el("tbody");
  for (const row of model.rows) {
    const tr = el("tr");
    const channel =
      row.channel in CHANNEL_LABELS ? channelLabel(row.channel) : row.channel === "unmapped" ? "Unmapped" : row.channel;
    tr.append(el("td", undefined, channel));
    tr.append(el("td", undefined, row.title));
    tr.append(el("td", undefined, row.detail));
    const sourceCell = el("td");
    if (row.source_url) {
      const link = el("a", "feed-card__link", row.source || "Source");
      link.href = row.source_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      sourceCell.append(link);
    } else {
      sourceCell.textContent = row.source || "—";
    }
    tr.append(sourceCell);
    const when = el("td");
    if (row.fetched_at) {
      const time = el("time", undefined, formatWhen(row.fetched_at));
      time.dateTime = row.fetched_at;
      when.append(time);
    } else {
      when.textContent = "—";
    }
    tr.append(when);
    body.append(tr);
  }
  table.append(caption, head, body);
  root.append(table);
  if (model.gaps.length) {
    const note = el("p", "paths__gaps");
    note.textContent = model.gaps.join(" ");
    root.append(note);
  }
}

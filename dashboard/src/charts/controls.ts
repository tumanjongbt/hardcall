import { CHANNELS, CHANNEL_LABELS } from "../channels";
import type { ChartRange, ViewState } from "../types";
import { comparePairLabel } from "./copy";
import { RANGE_PRESETS } from "./transforms";

export type ChartFilterHandlers = {
  onRange: (range: ChartRange) => void;
  onToggleCompare: (channel: string) => void;
};

export type ChartFilterMeta = {
  /** In-window event counts per channel. Missing means “don’t disable”. */
  volumes?: Record<string, number>;
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

function chip(
  label: string,
  pressed: boolean,
  onClick: () => void,
  extraClass = "",
  options: { disabled?: boolean; title?: string; radio?: boolean } = {}
): HTMLButtonElement {
  const button = el("button", `chip chip--compact ${extraClass}`.trim(), label);
  button.type = "button";
  if (options.radio) {
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", pressed ? "true" : "false");
  } else {
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
  }
  if (pressed) button.classList.add("is-active");
  if (options.disabled) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  }
  if (options.title) button.title = options.title;
  button.addEventListener("click", onClick);
  return button;
}

export function renderChartFilters(
  root: HTMLElement,
  view: ViewState,
  handlers: ChartFilterHandlers,
  meta: ChartFilterMeta = {}
): void {
  root.replaceChildren();
  root.classList.add("chart-filters");

  const rangeField = el("fieldset", "chart-filter");
  const rangeLegend = el("legend", "control-label", "Time range");
  rangeLegend.id = "range-label";
  const rangeRow = el("div", "chip-row");
  rangeRow.setAttribute("role", "radiogroup");
  rangeRow.setAttribute("aria-labelledby", "range-label");
  for (const days of RANGE_PRESETS) {
    const button = chip(
      `${days} days`,
      view.range === days,
      () => handlers.onRange(days),
      "",
      { radio: true }
    );
    button.dataset.range = String(days);
    rangeRow.append(button);
  }
  rangeField.append(rangeLegend, rangeRow);

  const compareField = el("fieldset", "chart-filter");
  const compareLegend = el("legend", "control-label", "Path compare");
  compareLegend.id = "compare-label";
  const compareRow = el("div", "chip-row");
  compareRow.setAttribute("role", "group");
  compareRow.setAttribute("aria-labelledby", "compare-label");
  compareRow.setAttribute("aria-multiselectable", "true");
  for (const channel of CHANNELS) {
    const selected = view.compare.includes(channel);
    const volume = meta.volumes?.[channel];
    const empty = volume === 0;
    const button = chip(
      CHANNEL_LABELS[channel],
      selected,
      () => handlers.onToggleCompare(channel),
      `chip--${channel}`,
      empty && !selected
        ? { disabled: true, title: "No events in this window" }
        : empty
          ? { title: "No events in this window" }
          : {}
    );
    button.dataset.compareChannel = channel;
    compareRow.append(button);
  }
  const compareNote = el("p", "chart-filter__hint", comparePairLabel(view.compare));
  compareField.append(compareLegend, compareRow, compareNote);

  root.append(rangeField, compareField);
}

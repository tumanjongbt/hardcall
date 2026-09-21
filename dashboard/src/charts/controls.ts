import {
  AUDIENCE_LENSES,
  CHANNELS,
  CHANNEL_LABELS,
  LENS_LABELS,
} from "../channels";
import type { AudienceLens, ChartRange, ForecastHorizon, ViewState } from "../types";
import { comparePairLabel, lensHint, NON_ADVISORY } from "./copy";
import { FORECAST_HORIZONS, RANGE_PRESETS } from "./transforms";

export type ChartFilterHandlers = {
  onLens: (lens: AudienceLens | null) => void;
  onRange: (range: ChartRange) => void;
  onForecast: (horizon: ForecastHorizon) => void;
  onToggleCompare: (channel: string) => void;
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
  extraClass = ""
): HTMLButtonElement {
  const button = el("button", `chip chip--compact ${extraClass}`.trim(), label);
  button.type = "button";
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  if (pressed) button.classList.add("is-active");
  button.addEventListener("click", onClick);
  return button;
}

export function renderChartFilters(
  root: HTMLElement,
  view: ViewState,
  handlers: ChartFilterHandlers
): void {
  root.replaceChildren();
  root.classList.add("chart-filters");

  const advisory = el("p", "non-advisory");
  advisory.setAttribute("role", "note");
  advisory.append(el("span", "non-advisory__chip", "Not advice"));
  advisory.append(el("span", "non-advisory__text", NON_ADVISORY));

  const lensField = el("fieldset", "chart-filter");
  const lensLegend = el("legend", "control-label", "Audience lens");
  lensLegend.id = "lens-label";
  const lensRow = el("div", "chip-row");
  lensRow.setAttribute("role", "radiogroup");
  lensRow.setAttribute("aria-labelledby", "lens-label");
  const allLens = chip("All", view.lens === null, () => handlers.onLens(null));
  allLens.setAttribute("aria-checked", view.lens === null ? "true" : "false");
  lensRow.append(allLens);
  for (const lens of AUDIENCE_LENSES) {
    const button = chip(LENS_LABELS[lens], view.lens === lens, () => handlers.onLens(lens));
    button.dataset.lens = lens;
    button.setAttribute("aria-checked", view.lens === lens ? "true" : "false");
    lensRow.append(button);
  }
  const lensNote = el(
    "p",
    "chart-filter__hint",
    lensHint(view.lens ? LENS_LABELS[view.lens] : "All")
  );
  lensField.append(lensLegend, lensRow, lensNote);

  const rangeField = el("fieldset", "chart-filter");
  const rangeLegend = el("legend", "control-label", "Time range");
  rangeLegend.id = "range-label";
  const rangeRow = el("div", "chip-row");
  rangeRow.setAttribute("role", "radiogroup");
  rangeRow.setAttribute("aria-labelledby", "range-label");
  for (const days of RANGE_PRESETS) {
    const button = chip(`${days} days`, view.range === days, () => handlers.onRange(days));
    button.dataset.range = String(days);
    button.setAttribute("aria-checked", view.range === days ? "true" : "false");
    rangeRow.append(button);
  }
  rangeField.append(rangeLegend, rangeRow);

  const forecastField = el("fieldset", "chart-filter");
  const forecastLegend = el("legend", "control-label", "Forecast horizon");
  forecastLegend.id = "forecast-label";
  const forecastRow = el("div", "chip-row");
  forecastRow.setAttribute("role", "radiogroup");
  forecastRow.setAttribute("aria-labelledby", "forecast-label");
  for (const days of FORECAST_HORIZONS) {
    const button = chip(
      `${days}-day band`,
      view.forecast === days,
      () => handlers.onForecast(days)
    );
    button.dataset.forecast = String(days);
    button.setAttribute("aria-checked", view.forecast === days ? "true" : "false");
    forecastRow.append(button);
  }
  const forecastNote = el(
    "p",
    "chart-filter__hint",
    "Projection only — the Not-advice chip cannot be dismissed."
  );
  forecastField.append(forecastLegend, forecastRow, forecastNote);

  const compareField = el("fieldset", "chart-filter");
  const compareLegend = el("legend", "control-label", "Path compare");
  compareLegend.id = "compare-label";
  const compareRow = el("div", "chip-row");
  compareRow.setAttribute("role", "group");
  compareRow.setAttribute("aria-labelledby", "compare-label");
  compareRow.setAttribute("aria-multiselectable", "true");
  for (const channel of CHANNELS) {
    const selected = view.compare.includes(channel);
    const button = chip(
      CHANNEL_LABELS[channel],
      selected,
      () => handlers.onToggleCompare(channel),
      `chip--${channel}`
    );
    button.dataset.compareChannel = channel;
    compareRow.append(button);
  }
  const compareNote = el("p", "chart-filter__hint", comparePairLabel(view.compare));
  compareField.append(compareLegend, compareRow, compareNote);

  root.append(advisory, lensField, rangeField, forecastField, compareField);
}

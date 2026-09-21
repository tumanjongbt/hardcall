import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import { CHANNELS, CHANNEL_LABELS, LENS_LABELS, channelLabel } from "../channels";
import type { EventRow, ForecastHorizon, ViewState } from "../types";
import {
  CHANNEL_COLORS,
  CORONA,
  HUMAN,
  LINE,
  PAPER,
  PAPER_DIM,
  RISK,
  SIGNAL,
  STAKEHOLDER_COLORS,
  hexAlpha,
} from "./colors";
import {
  CAPTIONS,
  EMPTY_COMPARE,
  FORECAST_CHIP,
  FORECAST_NOTE,
  INFORMS,
  NON_ADVISORY,
  PROJECTED_INTENSITY_LABEL,
  compareCaption,
  comparePairLabel,
  forecastSeriesLabel,
  historySeriesLabel,
  splitCaption,
  spikeCaption,
  vintageStrip,
} from "./copy";
import {
  FORECAST_HORIZONS,
  chartDataFromEvents,
  compareIsEmpty,
  type ChannelRankRow,
  type ChannelSeries,
  type ChartData,
  type DayBucket,
  type ForecastBand,
  type HeatMatrix,
  type SeriesVintage,
  type SpikeDay,
  type StakeholderSlice,
} from "./transforms";

export type ChartsModel = {
  events: EventRow[];
  view: ViewState;
  loading: boolean;
  loadError: string | null;
};

export type ChartViewHandlers = {
  onForecast: (horizon: ForecastHorizon) => void;
};

const instances = new Map<string, Chart>();
const SECONDARY_CHART_KEYS = ["doughnut", "stacked", "tags"] as const;
let registered = false;
let lastRender: {
  root: HTMLElement;
  model: ChartsModel;
  now: Date;
  handlers?: ChartViewHandlers;
} | null = null;
let lastWidth = 0;
let resizeTimer = 0;
let resizeObserver: ResizeObserver | null = null;

function ensureRegistered(): void {
  if (registered) return;
  Chart.register(
    LineController,
    BarController,
    DoughnutController,
    LineElement,
    BarElement,
    PointElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler
  );
  Chart.defaults.color = PAPER_DIM;
  Chart.defaults.borderColor = LINE;
  Chart.defaults.font.family = '"Avenir Next", "Segoe UI", sans-serif';
  registered = true;
}

function destroyChart(key: string): void {
  const chart = instances.get(key);
  if (!chart) return;
  chart.destroy();
  instances.delete(key);
}

function destroySecondaryCharts(): void {
  for (const key of SECONDARY_CHART_KEYS) destroyChart(key);
  for (const key of [...instances.keys()]) {
    if (key.startsWith("bar:")) destroyChart(key);
  }
}

export function teardownCharts(root?: HTMLElement): void {
  for (const chart of instances.values()) chart.destroy();
  instances.clear();
  lastRender = null;
  lastWidth = 0;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (root) {
    delete root.dataset.chartFp;
    root.replaceChildren();
  }
}

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

function canvasOf(root: HTMLElement, selector: string): HTMLCanvasElement | null {
  return root.querySelector<HTMLCanvasElement>(selector);
}

function upsert(
  key: string,
  canvas: HTMLCanvasElement,
  config: ChartConfiguration
): Chart {
  const existing = instances.get(key);
  if (existing) {
    existing.data.labels = config.data.labels;
    existing.data.datasets = config.data.datasets;
    existing.update();
    return existing;
  }
  const chart = new Chart(canvas, config);
  instances.set(key, chart);
  return chart;
}

function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function informs(text: string): HTMLParagraphElement {
  const p = el("p", "chart-panel__informs");
  p.append(el("strong", undefined, "What this informs. "), document.createTextNode(text));
  return p;
}

function panelTitle(text: string, id?: string): HTMLHeadingElement {
  const h = el("h2", "chart-panel__title", text);
  if (id) h.id = id;
  return h;
}

function activityConfig(
  buckets: DayBucket[],
  forecast: ForecastBand,
  spikes: SpikeDay[],
  vintage: SeriesVintage
): ChartConfiguration<"line"> {
  const spikeKeys = new Set(spikes.map((spike) => spike.key));
  const histLabel = historySeriesLabel(buckets.length, vintage.asOf, vintage.source);
  const forecastLabel = forecastSeriesLabel(forecast.horizon, vintage.asOf, vintage.source);
  const labels = [...buckets.map((bucket) => bucket.label), ...forecast.points.map((p) => p.label)];
  const hist = [
    ...buckets.map((bucket) => bucket.count),
    ...forecast.points.map(() => null),
  ];
  const last = buckets[buckets.length - 1]?.count ?? null;
  const mean = [
    ...buckets.slice(0, -1).map(() => null),
    last,
    ...forecast.points.map((point) => point.mean),
  ];
  const high = [
    ...buckets.map(() => null),
    ...forecast.points.map((point) => point.high),
  ];
  const low = [
    ...buckets.map(() => null),
    ...forecast.points.map((point) => point.low),
  ];
  const pointColors = [
    ...buckets.map((bucket) => (spikeKeys.has(bucket.key) ? CORONA : SIGNAL)),
    ...forecast.points.map(() => "transparent"),
  ];
  const pointRadius = [
    ...buckets.map((bucket) => (spikeKeys.has(bucket.key) ? 4 : 2)),
    ...forecast.points.map(() => 0),
  ];
  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: histLabel,
          data: hist,
          borderColor: CORONA,
          backgroundColor: "rgba(91, 44, 255, 0.18)",
          fill: false,
          tension: 0.25,
          pointRadius,
          pointHoverRadius: 5,
          pointBackgroundColor: pointColors,
          borderWidth: 2,
        },
        {
          label: forecastLabel,
          data: mean,
          borderColor: SIGNAL,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
        {
          label: "Band high",
          data: high,
          borderColor: "transparent",
          backgroundColor: hexAlpha(CORONA, 0.22),
          fill: "+1",
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 0,
        },
        {
          label: "Band low",
          data: low,
          borderColor: "transparent",
          backgroundColor: hexAlpha(CORONA, 0.22),
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: PAPER,
            boxWidth: 12,
            padding: 12,
            filter: (item) => item.datasetIndex === 0 || item.datasetIndex === 1,
          },
        },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          grid: { color: LINE },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Events" },
          grid: { color: LINE },
        },
      },
    },
  };
}

function doughnutConfig(data: ChartData): ChartConfiguration<"doughnut"> {
  const slices = data.distribution;
  return {
    type: "doughnut",
    data: {
      labels: slices.map((slice) => slice.label),
      datasets: [
        {
          data: slices.map((slice) => slice.count),
          backgroundColor: slices.map((slice) => CHANNEL_COLORS[slice.channel]),
          borderColor: "rgba(5, 1, 10, 0.55)",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: PAPER, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const slice = slices[ctx.dataIndex];
              if (!slice) return ctx.label ?? "";
              return `${slice.label}: ${slice.count} (${formatPercent(slice.percent)})`;
            },
          },
        },
      },
    },
  };
}

function stackedConfig(data: ChartData): ChartConfiguration<"line"> {
  return {
    type: "line",
    data: {
      labels: data.stacked.map((day) => day.label),
      datasets: CHANNELS.map((channel, index) => ({
        label: CHANNEL_LABELS[channel],
        data: data.stacked.map((day) => day.counts[channel]),
        borderColor: CHANNEL_COLORS[channel],
        backgroundColor: hexAlpha(CHANNEL_COLORS[channel], 0.42),
        fill: index === 0 ? "origin" : "-1",
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 1.5,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: PAPER, boxWidth: 12, padding: 12 },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          grid: { color: LINE },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Events" },
          grid: { color: LINE },
        },
      },
    },
  };
}

function stakeholderConfig(slices: StakeholderSlice[]): ChartConfiguration<"bar"> {
  return {
    type: "bar",
    data: {
      labels: slices.map((slice) => slice.label),
      datasets: [
        {
          label: "Alerts aimed at",
          data: slices.map((slice) => slice.count),
          backgroundColor: slices.map(
            (slice) => STAKEHOLDER_COLORS[slice.tag] ?? CORONA
          ),
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: LINE },
        },
        y: { grid: { display: false } },
      },
    },
  };
}

function splitConfig(data: ChartData): ChartConfiguration<"doughnut"> {
  const split = data.split;
  return {
    type: "doughnut",
    data: {
      labels: ["Automation risk", "Human pathways"],
      datasets: [
        {
          data: [split.automation, split.human],
          backgroundColor: [RISK, HUMAN],
          borderColor: "rgba(5, 1, 10, 0.55)",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: PAPER, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const value = Number(ctx.raw ?? 0);
              const pct = split.total === 0 ? 0 : (value / split.total) * 100;
              return `${ctx.label}: ${value} (${formatPercent(pct)})`;
            },
          },
        },
      },
    },
  };
}

function compareConfig(data: ChartData): ChartConfiguration<"line"> | null {
  if (!data.compare) return null;
  const { a, b } = data.compare;
  return {
    type: "line",
    data: {
      labels: a.buckets.map((bucket) => bucket.label),
      datasets: [
        {
          label: a.label,
          data: a.buckets.map((bucket) => bucket.count),
          borderColor: CHANNEL_COLORS[a.channel],
          backgroundColor: hexAlpha(CHANNEL_COLORS[a.channel], 0.12),
          fill: false,
          tension: 0.25,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: b.label,
          data: b.buckets.map((bucket) => bucket.count),
          borderColor: CHANNEL_COLORS[b.channel],
          backgroundColor: hexAlpha(CHANNEL_COLORS[b.channel], 0.12),
          fill: false,
          tension: 0.25,
          pointRadius: 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: PAPER, boxWidth: 12, padding: 12 },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          grid: { color: LINE },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Events" },
          grid: { color: LINE },
        },
      },
    },
  };
}

function barConfig(series: ChannelSeries): ChartConfiguration<"bar"> {
  const color = CHANNEL_COLORS[series.channel];
  return {
    type: "bar",
    data: {
      labels: series.buckets.map((bucket) => bucket.label),
      datasets: [
        {
          label: series.label,
          data: series.buckets.map((bucket) => bucket.count),
          backgroundColor: color,
          borderColor: color,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Events" },
          grid: { color: LINE },
        },
      },
    },
  };
}

function emptyState(root: HTMLElement, title: string, body: string, error = false): void {
  teardownCharts(root);
  const box = el("div", error ? "empty empty--error" : "empty");
  box.append(el("p", "empty__title", title));
  box.append(el("p", undefined, body));
  root.append(box);
}

function makeCanvas(id: string, aria: string): HTMLCanvasElement {
  const canvas = el("canvas");
  canvas.id = id;
  canvas.setAttribute("aria-label", aria);
  return canvas;
}

function chartPanel(
  title: string,
  wrapClass: string,
  canvas: HTMLCanvasElement,
  options: { inform?: string; caption?: string; id?: string } = {}
): HTMLElement {
  const section = el("section", "chart-panel");
  if (options.id) section.id = options.id;
  section.append(panelTitle(title));
  if (options.inform) section.append(informs(options.inform));
  else if (options.caption) section.append(el("p", "chart-panel__caption", options.caption));
  const wrap = el("div", wrapClass);
  wrap.append(canvas);
  section.append(wrap);
  return section;
}

function fingerprint(model: ChartsModel, data: ChartData): string {
  return [
    data.days,
    data.horizon,
    data.byChannel.map((series) => series.channel).join(","),
    model.view.compare.join(","),
  ].join("|");
}

function moreIsOpen(root: HTMLElement): boolean {
  return root.querySelector<HTMLDetailsElement>("#charts-more")?.open === true;
}

function ensureShell(
  root: HTMLElement,
  model: ChartsModel,
  data: ChartData,
  handlers?: ChartViewHandlers
): void {
  const fp = fingerprint(model, data);
  if (root.dataset.chartFp === fp && root.querySelector(".charts-primary")) return;

  const keepMoreOpen = moreIsOpen(root);
  for (const key of [...instances.keys()]) destroyChart(key);
  resizeObserver?.disconnect();
  root.replaceChildren();
  root.dataset.chartFp = fp;

  const days = data.days;
  const horizon = data.horizon;

  const meta = el("p", "charts-meta");
  meta.id = "charts-meta";

  const activityCanvas = makeCanvas(
    "chart-activity",
    `Event activity over the last ${days} days with a ${horizon}-day naive forecast band`
  );
  const activity = el("section", "chart-panel chart-panel--wide");
  activity.id = "chart-activity-panel";
  const activityHead = el("div", "chart-panel__head");
  activityHead.append(panelTitle(`Event activity · last ${days} days + ${horizon}d forecast`));
  const horizonRow = el("div", "chip-row chart-panel__horizon");
  horizonRow.setAttribute("role", "radiogroup");
  horizonRow.setAttribute("aria-label", "Forecast horizon");
  for (const daysAhead of FORECAST_HORIZONS) {
    const button = el("button", "chip chip--compact", `${daysAhead}-day band`);
    button.type = "button";
    button.dataset.forecast = String(daysAhead);
    button.setAttribute("aria-pressed", model.view.forecast === daysAhead ? "true" : "false");
    button.setAttribute("aria-checked", model.view.forecast === daysAhead ? "true" : "false");
    if (model.view.forecast === daysAhead) button.classList.add("is-active");
    button.addEventListener("click", () => handlers?.onForecast(daysAhead));
    horizonRow.append(button);
  }
  activityHead.append(horizonRow);
  const trust = el("div", "chart-trust");
  trust.id = "chart-trust";
  trust.setAttribute("role", "note");
  const chip = el("span", "non-advisory__chip chart-trust__chip", FORECAST_CHIP);
  chip.title = NON_ADVISORY;
  const vintage = el("p", "chart-trust__vintage");
  vintage.id = "chart-trust-vintage";
  trust.append(chip, vintage);
  const activityWrap = el("div", "chart-canvas-wrap");
  activityWrap.append(activityCanvas);
  const activityCaption = el("p", "chart-panel__caption chart-panel__caption--forecast");
  activityCaption.id = "chart-forecast-caption";
  activity.append(
    activityHead,
    el("p", "chart-panel__caption", CAPTIONS.activity),
    trust,
    activityWrap,
    activityCaption
  );

  const doughnutCanvas = makeCanvas("chart-channels", "Percentage of events by channel");
  const doughnut = chartPanel(
    "Events by channel",
    "chart-canvas-wrap chart-canvas-wrap--doughnut",
    doughnutCanvas,
    { inform: INFORMS.doughnut }
  );

  const stackedCanvas = makeCanvas(
    "chart-stacked",
    `Daily event composition by channel over the last ${days} days`
  );
  const stacked = chartPanel(
    `Path mix over time · last ${days} days`,
    "chart-canvas-wrap",
    stackedCanvas,
    { inform: INFORMS.stacked }
  );
  stacked.classList.add("chart-panel--wide");

  const splitCanvas = makeCanvas(
    "chart-split",
    "Automation risk versus human-skill pathways"
  );
  const split = chartPanel(
    "Automation resilience",
    "chart-canvas-wrap chart-canvas-wrap--doughnut",
    splitCanvas,
    { inform: CAPTIONS.split }
  );
  const meter = el("div", "resilience-meter");
  meter.id = "resilience-meter";
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-label", "Human-path share of this window");
  const fill = el("div", "resilience-meter__fill");
  fill.id = "resilience-fill";
  meter.append(fill);
  const splitCaptionEl = el("p", "chart-panel__caption");
  splitCaptionEl.id = "chart-split-caption";
  split.append(meter, splitCaptionEl);

  const tagsCanvas = makeCanvas(
    "chart-stakeholders",
    "Who alerts in this window are tagged for"
  );
  const tags = chartPanel(
    "Stakeholder breakdown",
    "chart-canvas-wrap",
    tagsCanvas,
    { inform: INFORMS.stakeholders }
  );

  const compareCanvas = makeCanvas("chart-compare", "Dual-path volume comparison");
  const compare = el("section", "chart-panel chart-panel--wide");
  compare.id = "chart-compare-panel";
  compare.append(
    panelTitle(`Path compare · ${comparePairLabel(model.view.compare)}`),
    el("p", "chart-panel__caption", CAPTIONS.compare)
  );
  const compareWrap = el("div", "chart-canvas-wrap");
  compareWrap.append(compareCanvas);
  const compareEmpty = el("p", "chart-empty");
  compareEmpty.id = "chart-compare-empty";
  compareEmpty.hidden = true;
  compareEmpty.setAttribute("role", "status");
  const compareCaptionEl = el("p", "chart-panel__caption");
  compareCaptionEl.id = "chart-compare-caption";
  compare.append(compareWrap, compareEmpty, compareCaptionEl);

  const heat = el("section", "chart-panel chart-panel--wide");
  heat.append(panelTitle("Channel × weekday intensity"), informs(INFORMS.heat));
  const heatHost = el("div", "heat-host");
  heatHost.id = "chart-heat";
  heat.append(heatHost);

  const barsBlock = el("section", "chart-panel chart-panel--wide");
  barsBlock.append(panelTitle("Per-path volume"), informs(INFORMS.bars));
  const bars = el("div", "chart-bars");
  bars.id = "chart-bars";
  for (const item of data.byChannel) {
    const panel = el("section", "chart-panel");
    panel.dataset.barChannel = item.channel;
    const canvas = el("canvas");
    canvas.dataset.channel = item.channel;
    canvas.setAttribute(
      "aria-label",
      `${item.label} event volume over the last ${days} days`
    );
    panel.append(panelTitle(`${item.label} · last ${days} days`));
    const wrap = el("div", "chart-canvas-wrap chart-canvas-wrap--bar");
    wrap.append(canvas);
    panel.append(wrap);
    bars.append(panel);
  }
  barsBlock.append(bars);

  const tablePanel = el("section", "chart-panel chart-panel--wide");
  tablePanel.id = "chart-data-panel";
  tablePanel.append(panelTitle("Path snapshot"), el("p", "chart-panel__caption", CAPTIONS.table));
  const tableHost = el("div", "data-view-host");
  tableHost.id = "chart-data-view";
  tablePanel.append(tableHost);

  const primary = el("div", "charts-primary");
  primary.append(activity, split, compare, tablePanel);

  const more = el("details", "charts-more");
  more.id = "charts-more";
  const summary = el("summary", "charts-more__summary", "More views");
  summary.title = "Stacked mix, stakeholders, weekday heat, and per-path bars";
  const moreBody = el("div", "charts-more__body");
  const mixGrid = el("div", "charts-grid");
  mixGrid.append(doughnut, tags);
  moreBody.append(mixGrid, stacked, heat, barsBlock);
  more.append(summary, moreBody);
  more.open = keepMoreOpen;
  more.addEventListener("toggle", () => {
    if (!lastRender) return;
    const current = chartDataFromEvents(lastRender.model.events, lastRender.now, {
      days: lastRender.model.view.range,
      channel: lastRender.model.view.channel,
      compare: lastRender.model.view.compare,
      horizon: lastRender.model.view.forecast,
    });
    if (more.open) {
      paintSecondary(root, current);
      requestAnimationFrame(() => {
        for (const key of SECONDARY_CHART_KEYS) instances.get(key)?.resize();
        for (const [key, chart] of instances) {
          if (key.startsWith("bar:")) chart.resize();
        }
      });
    } else {
      destroySecondaryCharts();
    }
  });

  root.append(meta, primary, more);
}

function paintMeta(root: HTMLElement, model: ChartsModel, data: ChartData): void {
  const meta = root.querySelector("#charts-meta");
  if (!meta) return;
  const channel = model.view.channel ? channelLabel(model.view.channel) : "All channels";
  const lens = model.view.lens ? LENS_LABELS[model.view.lens] : "All audiences";
  const q = model.view.q ? ` · “${model.view.q}”` : "";
  const compare =
    model.view.compare.length === 2
      ? ` · comparing ${channelLabel(model.view.compare[0] ?? "")} vs ${channelLabel(model.view.compare[1] ?? "")}`
      : "";
  meta.textContent = `${model.events.length} matching · ${data.inRangeCount} in last ${data.days} days · ${data.horizon}d forecast · ${channel} · ${lens}${q}${compare}`;
}

function paintTrust(root: HTMLElement, data: ChartData): void {
  const vintage = root.querySelector("#chart-trust-vintage");
  if (vintage) {
    vintage.textContent = vintageStrip(
      data.days,
      data.horizon,
      data.vintage.asOf,
      data.vintage.source
    );
  }
}

function paintActivityCaption(root: HTMLElement, data: ChartData): void {
  const node = root.querySelector("#chart-forecast-caption");
  if (!node) return;
  node.replaceChildren();
  const first = data.forecast.points[0];
  const last = data.forecast.points[data.forecast.points.length - 1];
  const range =
    first && last
      ? `${first.label}–${last.label} (next ${data.horizon}d)`
      : `next ${data.horizon}d`;
  const uncertainty =
    data.forecast.uncertainty === "high"
      ? " High uncertainty: history is sparse, so the band is wide."
      : " Band half-width is the historical daily SD.";
  const spikes = spikeCaption(data.spikes);
  node.append(
    document.createTextNode(
      `${PROJECTED_INTENSITY_LABEL}. ${FORECAST_NOTE} Naive last-rate ${data.forecast.level} ± ${data.forecast.pad} over ${range}. As of ${data.vintage.asOf} from ${data.vintage.source}.${uncertainty}${spikes ? ` ${spikes}` : ""}`
    )
  );
}

function paintSplit(root: HTMLElement, data: ChartData): void {
  const caption = root.querySelector("#chart-split-caption");
  if (caption) caption.textContent = splitCaption(data.split);
  const meter = root.querySelector("#resilience-meter");
  const fill = root.querySelector<HTMLElement>("#resilience-fill");
  if (meter) {
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(Math.round(data.split.resilienceScore)));
  }
  if (fill) fill.style.width = `${Math.round(data.split.resilienceScore)}%`;
}

function paintCompare(root: HTMLElement, data: ChartData): void {
  const caption = root.querySelector("#chart-compare-caption");
  const canvas = canvasOf(root, "#chart-compare");
  const wrap = canvas?.parentElement;
  const empty = root.querySelector<HTMLElement>("#chart-compare-empty");
  if (!caption || !canvas || !wrap || !empty) return;

  const showEmpty = (message: string): void => {
    destroyChart("compare");
    wrap.hidden = true;
    empty.hidden = false;
    empty.textContent = message;
    caption.textContent = "";
  };

  if (!data.compare) {
    showEmpty("Select two paths above to compare.");
    return;
  }
  if (compareIsEmpty(data.compare)) {
    showEmpty(EMPTY_COMPARE);
    return;
  }

  const config = compareConfig(data);
  if (!config) {
    showEmpty("Select two paths above to compare.");
    return;
  }
  empty.hidden = true;
  empty.textContent = "";
  wrap.hidden = false;
  caption.textContent = compareCaption(data.compare);
  upsert("compare", canvas, config);
}

function paintHeat(root: HTMLElement, heat: HeatMatrix): void {
  const host = root.querySelector("#chart-heat");
  if (!host) return;
  host.replaceChildren();
  const table = el("table", "heat-table");
  table.setAttribute("role", "grid");
  const caption = el("caption", undefined, "UTC weekday intensity by path");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(el("th", undefined, "Path"));
  for (const day of heat.weekdays) {
    const th = el("th", undefined, day);
    th.scope = "col";
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el("tbody");
  for (const row of heat.rows) {
    const tr = el("tr");
    const th = el("th", undefined, row.label);
    th.scope = "row";
    tr.append(th);
    for (let i = 0; i < row.cells.length; i += 1) {
      const count = row.cells[i] ?? 0;
      const t = heat.max === 0 ? 0 : count / heat.max;
      const td = el("td", "heat-cell", String(count));
      td.setAttribute(
        "aria-label",
        `${row.label}, ${heat.weekdays[i]}: ${count} event${count === 1 ? "" : "s"}`
      );
      td.style.background = `color-mix(in srgb, ${CHANNEL_COLORS[row.channel]} ${Math.round(t * 78)}%, transparent)`;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(caption, thead, tbody);
  host.append(table);
}

function paintRanks(root: HTMLElement, ranks: ChannelRankRow[], days: number): void {
  const host = root.querySelector("#chart-data-view");
  if (!host) return;
  host.replaceChildren();
  const table = el("table", "data-view");
  const caption = el(
    "caption",
    undefined,
    `Top channels by volume in the last ${days} days`
  );
  const thead = el("thead");
  const head = el("tr");
  for (const label of ["Path", "Volume", "Share", "DoD", "WoW", "So what"]) {
    const th = el("th", undefined, label);
    th.scope = "col";
    if (label === "DoD" || label === "WoW") th.className = "data-view__delta-col";
    head.append(th);
  }
  thead.append(head);
  const tbody = el("tbody");
  for (const row of ranks) {
    const tr = el("tr");
    const name = el("th", undefined, row.label);
    name.scope = "row";
    tr.append(
      name,
      el("td", undefined, String(row.count)),
      el("td", undefined, formatPercent(row.percent)),
      el("td", "data-view__delta", row.dodLabel),
      el("td", "data-view__delta", row.wowLabel),
      el("td", "data-view__so-what", row.soWhat)
    );
    tbody.append(tr);
  }
  table.append(caption, thead, tbody);
  host.append(table);
}

function paintPrimary(root: HTMLElement, data: ChartData): void {
  const activityCanvas = canvasOf(root, "#chart-activity");
  if (activityCanvas) {
    upsert(
      "line",
      activityCanvas,
      activityConfig(data.activity, data.forecast, data.spikes, data.vintage)
    );
  }
  const splitCanvas = canvasOf(root, "#chart-split");
  if (splitCanvas) upsert("split", splitCanvas, splitConfig(data));
  paintSplit(root, data);
  paintCompare(root, data);
}

function paintSecondary(root: HTMLElement, data: ChartData): void {
  if (!moreIsOpen(root)) {
    destroySecondaryCharts();
    return;
  }
  const doughnutCanvas = canvasOf(root, "#chart-channels");
  const stackedCanvas = canvasOf(root, "#chart-stacked");
  const tagsCanvas = canvasOf(root, "#chart-stakeholders");
  if (doughnutCanvas) upsert("doughnut", doughnutCanvas, doughnutConfig(data));
  if (stackedCanvas) upsert("stacked", stackedCanvas, stackedConfig(data));
  if (tagsCanvas) upsert("tags", tagsCanvas, stakeholderConfig(data.stakeholders));
  paintHeat(root, data.heat);

  const wantedBars = new Set(data.byChannel.map((series) => `bar:${series.channel}`));
  for (const key of [...instances.keys()]) {
    if (key.startsWith("bar:") && !wantedBars.has(key)) destroyChart(key);
  }
  for (const series of data.byChannel) {
    const canvas = root.querySelector<HTMLCanvasElement>(
      `canvas[data-channel="${series.channel}"]`
    );
    if (!canvas) continue;
    upsert(`bar:${series.channel}`, canvas, barConfig(series));
  }
}

function scheduleReflow(): void {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!lastRender) return;
    const width = lastRender.root.clientWidth;
    if (width < 16) return;
    if (Math.abs(width - lastWidth) < 2 && instances.size > 0) {
      for (const chart of instances.values()) chart.resize();
      return;
    }
    lastWidth = width;
    const { root, model, now } = lastRender;
    const data = chartDataFromEvents(model.events, now, {
      days: model.view.range,
      channel: model.view.channel,
      compare: model.view.compare,
      horizon: model.view.forecast,
    });
    for (const key of [...instances.keys()]) destroyChart(key);
    paintPrimary(root, data);
    paintSecondary(root, data);
  }, 160);
}

function observeRoot(root: HTMLElement): void {
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => scheduleReflow());
  resizeObserver.observe(root);
}

export function renderCharts(
  root: HTMLElement,
  model: ChartsModel,
  now = new Date(),
  handlers?: ChartViewHandlers
): void {
  ensureRegistered();
  lastRender = { root, model, now, handlers };
  if (model.loading) {
    teardownCharts(root);
    lastRender = { root, model, now, handlers };
    root.append(el("p", "empty", "Pulling the latest orbit…"));
    return;
  }
  if (model.loadError) {
    emptyState(root, "Could not load history", model.loadError, true);
    lastRender = { root, model, now, handlers };
    return;
  }
  if (model.events.length === 0) {
    emptyState(
      root,
      "No events match this filter",
      "Try another channel, search, or audience lens. Charts use the same subset as Events, then apply the lens."
    );
    lastRender = { root, model, now, handlers };
    return;
  }

  const data = chartDataFromEvents(model.events, now, {
    days: model.view.range,
    channel: model.view.channel,
    compare: model.view.compare,
    horizon: model.view.forecast,
  });
  ensureShell(root, model, data, handlers);
  paintMeta(root, model, data);
  paintTrust(root, data);
  paintActivityCaption(root, data);
  paintRanks(root, data.ranks, data.days);
  paintPrimary(root, data);
  paintSecondary(root, data);
  lastWidth = root.clientWidth;
  observeRoot(root);
}

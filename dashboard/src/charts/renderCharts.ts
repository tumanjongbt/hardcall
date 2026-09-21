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
import { channelLabel } from "../channels";
import type { EventRow, ViewState } from "../types";
import { CHANNEL_COLORS, CORONA, LINE, PAPER, PAPER_DIM, SIGNAL } from "./colors";
import {
  WINDOW_DAYS,
  chartDataFromEvents,
  type ChannelSeries,
  type ChartData,
  type DayBucket,
} from "./transforms";

export type ChartsModel = {
  events: EventRow[];
  view: ViewState;
  loading: boolean;
  loadError: string | null;
};

const instances = new Map<string, Chart>();
let registered = false;

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

export function teardownCharts(root?: HTMLElement): void {
  for (const chart of instances.values()) chart.destroy();
  instances.clear();
  if (root) root.replaceChildren();
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
    existing.update("none");
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

function lineConfig(buckets: DayBucket[]): ChartConfiguration<"line"> {
  return {
    type: "line",
    data: {
      labels: buckets.map((bucket) => bucket.label),
      datasets: [
        {
          label: "Events",
          data: buckets.map((bucket) => bucket.count),
          borderColor: CORONA,
          backgroundColor: "rgba(91, 44, 255, 0.22)",
          fill: true,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: SIGNAL,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false },
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

function doughnutConfig(data: ChartData): ChartConfiguration<"doughnut"> {
  const slices = data.distribution.filter((slice) => slice.count > 0);
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
      plugins: {
        legend: { display: false },
      },
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

function ensureShell(root: HTMLElement, series: ChannelSeries[]): void {
  const existing = root.querySelector(".charts-grid");
  const barKeys = [...root.querySelectorAll<HTMLElement>("[data-bar-channel]")].map(
    (node) => node.dataset.barChannel
  );
  const wanted = series.map((item) => item.channel);
  if (existing && barKeys.join() === wanted.join()) return;

  for (const key of [...instances.keys()]) {
    if (key === "line" || key === "doughnut" || key.startsWith("bar:")) destroyChart(key);
  }
  root.replaceChildren();

  const meta = el("p", "charts-meta");
  meta.id = "charts-meta";

  const grid = el("div", "charts-grid");

  const activity = el("section", "chart-panel");
  activity.append(el("h2", "chart-panel__title", "Event activity · last 30 days"));
  const activityWrap = el("div", "chart-canvas-wrap");
  const activityCanvas = el("canvas");
  activityCanvas.id = "chart-activity";
  activityCanvas.setAttribute("aria-label", "Event activity over the last 30 days");
  activityWrap.append(activityCanvas);
  activity.append(activityWrap);

  const doughnut = el("section", "chart-panel");
  doughnut.append(el("h2", "chart-panel__title", "Events by channel"));
  const doughnutWrap = el("div", "chart-canvas-wrap chart-canvas-wrap--doughnut");
  const doughnutCanvas = el("canvas");
  doughnutCanvas.id = "chart-channels";
  doughnutCanvas.setAttribute("aria-label", "Percentage of events by channel");
  doughnutWrap.append(doughnutCanvas);
  doughnut.append(doughnutWrap);

  const bars = el("div", "chart-bars");
  bars.id = "chart-bars";
  for (const item of series) {
    const panel = el("section", "chart-panel");
    panel.dataset.barChannel = item.channel;
    panel.append(
      el("h2", "chart-panel__title", `${item.label} · last 30 days`)
    );
    const wrap = el("div", "chart-canvas-wrap chart-canvas-wrap--bar");
    const canvas = el("canvas");
    canvas.dataset.channel = item.channel;
    canvas.setAttribute("aria-label", `${item.label} event volume over the last 30 days`);
    wrap.append(canvas);
    panel.append(wrap);
    bars.append(panel);
  }

  grid.append(activity, doughnut);
  root.append(meta, grid, bars);
}

function paintMeta(root: HTMLElement, model: ChartsModel, data: ChartData): void {
  const meta = root.querySelector("#charts-meta");
  if (!meta) return;
  const channel = model.view.channel
    ? channelLabel(model.view.channel)
    : "All channels";
  const q = model.view.q ? ` · “${model.view.q}”` : "";
  const inWindow = data.activity.reduce((sum, bucket) => sum + bucket.count, 0);
  meta.textContent = `${model.events.length} matching event${
    model.events.length === 1 ? "" : "s"
  } · ${inWindow} in last ${WINDOW_DAYS} days · ${channel}${q}`;
}

export function renderCharts(root: HTMLElement, model: ChartsModel, now = new Date()): void {
  ensureRegistered();
  if (model.loading) {
    teardownCharts(root);
    root.append(el("p", "empty", "Pulling the latest orbit…"));
    return;
  }
  if (model.loadError) {
    emptyState(root, "Could not load history", model.loadError, true);
    return;
  }
  if (model.events.length === 0) {
    emptyState(
      root,
      "No events match this filter",
      "Try another channel or search. Charts use the same subset as Events."
    );
    return;
  }

  const data = chartDataFromEvents(model.events, now, { channel: model.view.channel });
  ensureShell(root, data.byChannel);
  paintMeta(root, model, data);

  const activityCanvas = canvasOf(root, "#chart-activity");
  const doughnutCanvas = canvasOf(root, "#chart-channels");
  if (activityCanvas) upsert("line", activityCanvas, lineConfig(data.activity));
  if (doughnutCanvas) upsert("doughnut", doughnutCanvas, doughnutConfig(data));

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


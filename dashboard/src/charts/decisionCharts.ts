import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  ArcElement,
  Legend,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import { channelLabel, type Channel } from "../channels";
import { statusBox } from "../render";
import type { DecisionFilters } from "../warehouse";
import {
  channelMix,
  costEarningsSeries,
  projectionSeries,
  wageDistribution,
  type WarehouseSnapshot,
} from "../warehouse";
import { CHANNEL_COLORS, CORONA, LINE, MUTE, PAPER_DIM, SIGNAL, ACCRETION } from "./colors";

export type DecisionChartModel = {
  snapshot: WarehouseSnapshot;
  filters: DecisionFilters;
  loading: boolean;
};

const instances = new Map<string, Chart>();
let registered = false;

function ensureRegistered(): void {
  if (registered) return;
  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    DoughnutController,
    ArcElement,
    ScatterController,
    PointElement,
    Tooltip,
    Legend
  );
  Chart.defaults.color = PAPER_DIM;
  Chart.defaults.borderColor = LINE;
  Chart.defaults.font.family = '"DM Sans", Inter, system-ui, sans-serif';
  registered = true;
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

export function teardownDecisionCharts(root?: HTMLElement): void {
  for (const chart of instances.values()) chart.destroy();
  instances.clear();
  if (root) root.replaceChildren();
}

function panel(title: string, caption: string): { card: HTMLElement; body: HTMLElement } {
  const card = el("article", "chart-panel decision-panel");
  card.append(el("h2", "chart-panel__title", title));
  card.append(el("p", "chart-panel__informs", caption));
  const body = el("div", "decision-panel__body");
  card.append(body);
  return { card, body };
}

function mountChart(key: string, host: HTMLElement, config: ChartConfiguration): void {
  const wrap = el("div", "chart-canvas-wrap");
  const canvas = el("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", key);
  wrap.append(canvas);
  host.append(wrap);
  const existing = instances.get(key);
  if (existing) existing.destroy();
  instances.set(key, new Chart(canvas, config));
}

function wageConfig(labels: string[], counts: number[]): ChartConfiguration<"bar"> {
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Occupations",
          data: counts,
          backgroundColor: CORONA,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: MUTE } },
        y: { beginAtZero: true, ticks: { precision: 0, color: MUTE }, title: { display: true, text: "Rows" } },
      },
    },
  };
}

function projectionConfig(labels: string[], values: number[]): ChartConfiguration<"bar"> {
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Percent change",
          data: values,
          backgroundColor: values.map((value) => (value < 0 ? ACCRETION : SIGNAL)),
          borderWidth: 0,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: MUTE }, title: { display: true, text: "change_percent" } },
        y: { ticks: { color: MUTE } },
      },
    },
  };
}

function mixConfig(labels: string[], counts: number[], colors: string[]): ChartConfiguration<"doughnut"> {
  return {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: PAPER_DIM } } },
    },
  };
}

function scatterConfig(points: Array<{ label: string; cost: number; earnings: number }>): ChartConfiguration<"scatter"> {
  return {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Programs or institutions",
          data: points.map((point) => ({ x: point.cost, y: point.earnings })),
          backgroundColor: SIGNAL,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(item) {
              const point = points[item.dataIndex];
              return point ? point.label : "";
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: MUTE }, title: { display: true, text: "Cost (published field)" } },
        y: { ticks: { color: MUTE }, title: { display: true, text: "Median earnings" } },
      },
    },
  };
}

export function renderDecisionCharts(root: HTMLElement, model: DecisionChartModel): void {
  teardownDecisionCharts(root);
  ensureRegistered();
  if (model.loading) {
    root.append(statusBox("loading", "Pulling warehouse endpoints…"));
    return;
  }

  const wage = wageDistribution(model.snapshot, model.filters);
  const projections = projectionSeries(model.snapshot, model.filters);
  const cost = costEarningsSeries(model.snapshot, model.filters);
  const mix = channelMix(model.snapshot, model.filters);

  const wagePanel = panel(
    "Occupation wage distribution",
    wage.scope || "Counts of returned OEWS rows by published annual wage. No bars means the wage field was absent."
  );
  if (wage.emptyReason || wage.buckets.length === 0) {
    wagePanel.body.append(statusBox("empty", wage.emptyReason ?? "No wage rows to chart.", "No wage distribution"));
  } else {
    mountChart(
      "wages",
      wagePanel.body,
      wageConfig(
        wage.buckets.map((bucket) => bucket.label),
        wage.buckets.map((bucket) => bucket.count)
      )
    );
  }

  const projectionPanel = panel("Projection percent change", projections.note);
  if (projections.emptyReason || projections.bars.length === 0) {
    projectionPanel.body.append(
      statusBox("empty", projections.emptyReason ?? "No projection rows to chart.", "No projection chart")
    );
  } else {
    mountChart(
      "projections",
      projectionPanel.body,
      projectionConfig(
        projections.bars.map((bar) => bar.label),
        projections.bars.map((bar) => bar.value)
      )
    );
  }

  const costPanel = panel("College cost vs earnings", cost.metric);
  if (cost.emptyReason || cost.points.length === 0) {
    costPanel.body.append(statusBox("empty", cost.emptyReason ?? "No paired cost and earnings fields.", "No cost chart"));
  } else {
    if (cost.total > cost.shown) {
      costPanel.body.append(
        el("p", "chart-filter__hint", `Showing ${cost.shown} of ${cost.total} rows that include both fields.`)
      );
    }
    mountChart("cost", costPanel.body, scatterConfig(cost.points));
  }

  const mixPanel = panel("Channel mix", mix.note);
  if (mix.emptyReason || mix.slices.length === 0) {
    mixPanel.body.append(statusBox("empty", mix.emptyReason ?? "No mapped rows.", "No channel mix"));
  } else {
    if (mix.unmapped > 0) {
      mixPanel.body.append(
        el(
          "p",
          "chart-filter__hint",
          `${mix.unmapped} scorecard rows had no level or community-college name, so they are not in a channel.`
        )
      );
    }
    mountChart(
      "mix",
      mixPanel.body,
      mixConfig(
        mix.slices.map((slice) => channelLabel(slice.channel)),
        mix.slices.map((slice) => slice.count),
        mix.slices.map((slice) => CHANNEL_COLORS[slice.channel as Channel])
      )
    );
  }

  const grid = el("div", "charts-grid decision-grid");
  grid.append(wagePanel.card, projectionPanel.card, costPanel.card, mixPanel.card);
  root.append(grid);
}

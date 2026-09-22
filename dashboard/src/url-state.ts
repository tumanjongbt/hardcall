import { isAudienceLens, isChannel } from "./channels";
import type {
  AudienceLens,
  ChartRange,
  DashboardTab,
  ForecastHorizon,
  PerPage,
  ViewState,
} from "./types";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE: PerPage = 50;
export const DEFAULT_TAB: DashboardTab = "events";
export const DEFAULT_RANGE: ChartRange = 30;
export const DEFAULT_FORECAST: ForecastHorizon = 14;
export const DEFAULT_COMPARE = ["trade", "university"] as const;

export function defaultViewState(): ViewState {
  return {
    tab: DEFAULT_TAB,
    page: DEFAULT_PAGE,
    perPage: DEFAULT_PER_PAGE,
    channel: null,
    q: "",
    insight: null,
    lens: null,
    range: DEFAULT_RANGE,
    forecast: DEFAULT_FORECAST,
    compare: [...DEFAULT_COMPARE],
    state: null,
    cip: null,
    outlook: null,
  };
}

export function parseTab(value: string | null): DashboardTab {
  if (value === "insights" || value === "charts" || value === "playground" || value === "admin") {
    return value;
  }
  if (value === "seed") return "admin";
  return "events";
}

export function parsePerPage(value: string | null): PerPage {
  if (value === "100") return 100;
  if (value === "all") return "all";
  return 50;
}

export function parseRange(value: string | null): ChartRange {
  if (value === "7" || value === "14" || value === "30" || value === "90") {
    return Number(value) as ChartRange;
  }
  return DEFAULT_RANGE;
}

export function parseForecast(value: string | null): ForecastHorizon {
  if (value === "14" || value === "30") return Number(value) as ForecastHorizon;
  return DEFAULT_FORECAST;
}

/** Accepts `students` / `parents` / `counselors` / `workforce`, plus raw tag names. */
export function parseLens(value: string | null): AudienceLens | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "all" || raw === "") return null;
  if (isAudienceLens(raw)) return raw;
  if (raw === "high_school_students" || raw === "college_students") return "students";
  if (raw === "career_counselors") return "counselors";
  if (raw === "workforce_training_managers") return "workforce";
  return null;
}

export function parseState(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/[^\p{L}\s.-]/gu, "").slice(0, 40);
  if (!trimmed) return null;
  return trimmed.length === 2 ? trimmed.toUpperCase() : trimmed;
}

export function parseCip(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return trimmed || null;
}

export function parseOutlook(value: string | null): ViewState["outlook"] {
  if (value === "grow" || value === "decline") return value;
  return null;
}

export function parseCompare(value: string | null): string[] {
  if (value === null) return [...DEFAULT_COMPARE];
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "none") return [];
  const seen = new Set<string>();
  const channels: string[] = [];
  for (const part of trimmed.split(",")) {
    const channel = part.trim();
    if (!isChannel(channel) || seen.has(channel)) continue;
    seen.add(channel);
    channels.push(channel);
    if (channels.length === 2) break;
  }
  return channels;
}

function comparesAreDefault(compare: string[]): boolean {
  return (
    compare.length === DEFAULT_COMPARE.length &&
    compare[0] === DEFAULT_COMPARE[0] &&
    compare[1] === DEFAULT_COMPARE[1]
  );
}

export function parseViewState(search: string): ViewState {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const pageRaw = Number(params.get("page") ?? DEFAULT_PAGE);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : DEFAULT_PAGE;
  const channelRaw = params.get("channel");
  const channel =
    channelRaw && isChannel(channelRaw) ? channelRaw : null;
  const insightRaw = (params.get("insight") ?? "").trim();
  const insight = insightRaw.length > 0 ? insightRaw : null;
  const tab = insight ? "insights" : parseTab(params.get("tab"));
  const lens = parseLens(params.get("lens") ?? params.get("stakeholder"));
  return {
    tab,
    page,
    perPage: parsePerPage(params.get("perPage")),
    channel,
    q: (params.get("q") ?? "").trim(),
    insight,
    lens,
    range: parseRange(params.get("range")),
    forecast: parseForecast(params.get("forecast")),
    compare: parseCompare(params.get("compare")),
    state: parseState(params.get("state")),
    cip: parseCip(params.get("cip")),
    outlook: parseOutlook(params.get("outlook")),
  };
}

export function serializeViewState(state: ViewState): string {
  const params = new URLSearchParams();
  const range = state.range ?? DEFAULT_RANGE;
  const forecast = state.forecast ?? DEFAULT_FORECAST;
  const compare = state.compare ?? [...DEFAULT_COMPARE];
  if (state.tab !== DEFAULT_TAB) params.set("tab", state.tab);
  params.set("page", String(state.page));
  params.set("perPage", String(state.perPage));
  if (state.channel) params.set("channel", state.channel);
  const q = state.q.trim();
  if (q) params.set("q", q);
  if (state.tab === "insights" && state.insight) {
    params.set("insight", state.insight);
  }
  if (state.lens) params.set("lens", state.lens);
  if (range !== DEFAULT_RANGE) params.set("range", String(range));
  if (forecast !== DEFAULT_FORECAST) {
    params.set("forecast", String(forecast));
  }
  if (compare.length === 0) {
    params.set("compare", "none");
  } else if (!comparesAreDefault(compare)) {
    params.set("compare", compare.join(","));
  }
  const stateFilter = (state.state ?? "").trim();
  if (stateFilter) params.set("state", stateFilter);
  const cip = (state.cip ?? "").trim();
  if (cip) params.set("cip", cip);
  if (state.outlook) params.set("outlook", state.outlook);
  return params.toString();
}

export function hrefForState(state: ViewState, pathname = "/"): string {
  const qs = serializeViewState(state);
  return qs ? `${pathname}?${qs}` : pathname;
}

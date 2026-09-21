import { isChannel } from "./channels";
import type { DashboardTab, PerPage, ViewState } from "./types";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE: PerPage = 50;
export const DEFAULT_TAB: DashboardTab = "events";

export function defaultViewState(): ViewState {
  return {
    tab: DEFAULT_TAB,
    page: DEFAULT_PAGE,
    perPage: DEFAULT_PER_PAGE,
    channel: null,
    q: "",
  };
}

export function parseTab(value: string | null): DashboardTab {
  return value === "insights" ? "insights" : "events";
}

export function parsePerPage(value: string | null): PerPage {
  if (value === "100") return 100;
  if (value === "all") return "all";
  return 50;
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
  return {
    tab: parseTab(params.get("tab")),
    page,
    perPage: parsePerPage(params.get("perPage")),
    channel,
    q: (params.get("q") ?? "").trim(),
  };
}

export function serializeViewState(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_TAB) params.set("tab", state.tab);
  params.set("page", String(state.page));
  params.set("perPage", String(state.perPage));
  if (state.channel) params.set("channel", state.channel);
  const q = state.q.trim();
  if (q) params.set("q", q);
  return params.toString();
}

export function hrefForState(state: ViewState, pathname = "/"): string {
  const qs = serializeViewState(state);
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Production ethics gate. Demo/seed/playground writes stay off when this is false. */

export const DEMO_EVENT_SOURCES = new Set(["synthetic", "playground", "cli"]);
export const DEMO_INSIGHT_SOURCES = new Set(["synthetic"]);

export const DEMO_DISABLED_ERROR = "demo_disabled";

export function allowDemoFromEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = (env.HARDCALL_ALLOW_DEMO ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  return env.NODE_ENV !== "production";
}

export function isDemoEventSource(source: string | null | undefined): boolean {
  return typeof source === "string" && DEMO_EVENT_SOURCES.has(source);
}

export function isDemoInsightSource(source: string | null | undefined): boolean {
  return typeof source === "string" && DEMO_INSIGHT_SOURCES.has(source);
}

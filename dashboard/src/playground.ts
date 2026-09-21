import { CHANNELS, TAGS, type Channel, type StakeholderTag } from "./channels";

export type PlaygroundForm = {
  channel: Channel;
  title: string;
  description: string;
  emoji: string;
  tags: StakeholderTag[];
};

export type TokenType =
  | "keyword"
  | "function"
  | "property"
  | "string"
  | "punctuation"
  | "plain";

export type Token = { type: TokenType; value: string };

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const PUNCT = "{}[](),;:.";

export function defaultPlaygroundForm(): PlaygroundForm {
  return {
    channel: "university",
    title: "",
    description: "",
    emoji: "",
    tags: [],
  };
}

export function isStakeholderTag(value: string): value is StakeholderTag {
  return (TAGS as readonly string[]).includes(value);
}

export function normalizeChannel(value: string): Channel {
  return (CHANNELS as readonly string[]).includes(value)
    ? (value as Channel)
    : "university";
}

export function buildEventPayload(form: PlaygroundForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    channel: form.channel,
    title: form.title,
  };
  const description = form.description.trim();
  if (description) payload.description = description;
  const emoji = form.emoji.trim();
  if (emoji) payload.emoji = emoji;
  payload.tags = [...form.tags];
  payload.source = "playground";
  return payload;
}

export function fetchSnippet(apiOrigin: string, payload: unknown): string {
  const base = apiOrigin.replace(/\/+$/, "");
  const url = `${base}/api/events`;
  const json = JSON.stringify(payload, null, 2);
  const indented = json
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
  return `fetch(${JSON.stringify(url)}, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${indented})
});`;
}

export function tokenizeJsFetch(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (ch === '"') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ type: "string", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < source.length && IDENT_PART.test(source[j] ?? "")) j += 1;
      const word = source.slice(i, j);
      let type: TokenType = "plain";
      if (word === "fetch" || word === "stringify") type = "function";
      else if (
        word === "JSON" ||
        word === "method" ||
        word === "headers" ||
        word === "body"
      ) {
        type = "keyword";
      }
      tokens.push({ type, value: word });
      i = j;
      continue;
    }
    if (PUNCT.includes(ch)) {
      tokens.push({ type: "punctuation", value: ch });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < source.length) {
      const next = source[j] ?? "";
      if (next === '"' || IDENT_START.test(next) || PUNCT.includes(next)) break;
      j += 1;
    }
    tokens.push({ type: "plain", value: source.slice(i, j) });
    i = j;
  }
  return markJsonProperties(tokens);
}

function markJsonProperties(tokens: Token[]): Token[] {
  const out = tokens.map((token) => ({ ...token }));
  for (let i = 0; i < out.length; i++) {
    const token = out[i];
    if (!token || token.type !== "string") continue;
    let k = i + 1;
    while (k < out.length && out[k]?.type === "plain" && /^\s*$/.test(out[k]?.value ?? "")) {
      k += 1;
    }
    if (out[k]?.type === "punctuation" && out[k]?.value === ":") {
      token.type = "property";
    }
  }
  return out;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function tokensToHtml(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === "plain") return escapeHtml(token.value);
      return `<span class="token token--${token.type}">${escapeHtml(token.value)}</span>`;
    })
    .join("");
}

export function highlightFetchHtml(source: string): string {
  return tokensToHtml(tokenizeJsFetch(source));
}

export function formatApiError(status: number, body: unknown, raw = ""): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const rec = body as { error?: unknown; details?: unknown; message?: unknown };
    const head =
      typeof rec.error === "string"
        ? rec.error
        : typeof rec.message === "string"
          ? rec.message
          : "";
    let details = "";
    if (Array.isArray(rec.details)) {
      details = rec.details
        .map((item) => {
          if (!item || typeof item !== "object") return String(item);
          const row = item as { field?: unknown; rule?: unknown };
          const field = typeof row.field === "string" ? row.field : "?";
          const rule = typeof row.rule === "string" ? row.rule : "?";
          return `${field}: ${rule}`;
        })
        .join("; ");
    }
    const msg = [head, details].filter(Boolean).join(" — ");
    return msg ? `HTTP ${status}: ${msg}` : `HTTP ${status}`;
  }
  const text = raw.trim();
  return text ? `HTTP ${status}: ${text}` : `HTTP ${status}`;
}

export function createdEventSummary(body: unknown): { id: string; title: string } {
  if (!body || typeof body !== "object") {
    return { id: "unknown", title: "" };
  }
  const rec = body as { id?: unknown; title?: unknown };
  return {
    id: typeof rec.id === "string" && rec.id ? rec.id : "unknown",
    title: typeof rec.title === "string" ? rec.title : "",
  };
}

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEventPayload,
  createdEventSummary,
  defaultPlaygroundForm,
  escapeHtml,
  fetchSnippet,
  formatApiError,
  highlightFetchHtml,
  tokenizeJsFetch,
} from "./playground";

test("buildEventPayload omits blank optionals and keeps tags", () => {
  assert.deepEqual(
    buildEventPayload({
      channel: "trade",
      title: "HVAC demand",
      description: "  ",
      emoji: "",
      tags: ["parents", "career_counselors"],
    }),
    {
      channel: "trade",
      title: "HVAC demand",
      tags: ["parents", "career_counselors"],
      source: "playground",
    }
  );
  assert.deepEqual(
    buildEventPayload({
      ...defaultPlaygroundForm(),
      title: "CS salaries up",
      description: " Metro X ",
      emoji: "📈",
      tags: ["college_students"],
    }),
    {
      channel: "university",
      title: "CS salaries up",
      description: "Metro X",
      emoji: "📈",
      tags: ["college_students"],
      source: "playground",
    }
  );
});

test("fetchSnippet is a native POST /api/events fetch matching form JSON", () => {
  const payload = buildEventPayload({
    channel: "automation",
    title: 'Clerical roles "at risk"',
    description: "BLS-style outlook",
    emoji: "🤖",
    tags: ["workforce_training_managers"],
  });
  const source = fetchSnippet("https://hardcall-api.onrender.com/", payload);
  assert.match(source, /^fetch\("https:\/\/hardcall-api\.onrender\.com\/api\/events", \{/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /"Content-Type": "application\/json"/);
  assert.match(source, /body: JSON\.stringify\(\{/);
  assert.ok(source.includes('"channel": "automation"'));
  assert.ok(source.includes('"title": "Clerical roles \\"at risk\\""'));
  assert.ok(source.includes('"emoji": "🤖"'));
  assert.ok(source.endsWith("});"));
});

test("tokenizeJsFetch round-trips source and marks fetch/strings/properties", () => {
  const source = fetchSnippet("https://hardcall-api.onrender.com", {
    channel: "university",
    title: "Hello <script>",
    tags: [],
  });
  const tokens = tokenizeJsFetch(source);
  assert.equal(tokens.map((token) => token.value).join(""), source);
  assert.ok(tokens.some((token) => token.type === "function" && token.value === "fetch"));
  assert.ok(tokens.some((token) => token.type === "keyword" && token.value === "method"));
  assert.ok(tokens.some((token) => token.type === "string" && token.value.includes("/api/events")));
  assert.ok(tokens.some((token) => token.type === "property" && token.value === '"channel"'));
  const html = highlightFetchHtml(source);
  assert.ok(html.includes('class="token token--function"'));
  assert.ok(html.includes("Hello &lt;script&gt;"));
  assert.equal(escapeHtml("<x>"), "&lt;x&gt;");
});

test("formatApiError includes status plus validation details", () => {
  assert.equal(
    formatApiError(400, {
      error: "validation_failed",
      details: [{ field: "title", rule: "length_1_200" }],
    }),
    "HTTP 400: validation_failed — title: length_1_200"
  );
  assert.equal(formatApiError(500, { error: "persist_failed" }), "HTTP 500: persist_failed");
  assert.equal(formatApiError(415, null, "nope"), "HTTP 415: nope");
  assert.deepEqual(createdEventSummary({ id: "abc", title: "Welders" }), {
    id: "abc",
    title: "Welders",
  });
});

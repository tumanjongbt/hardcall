import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_API, apiBase } from "./config";

test("apiBase defaults and strips to origin only", () => {
  assert.equal(apiBase({}), DEFAULT_API);
  assert.equal(apiBase({ VITE_EVENTS_API_URL: "" }), DEFAULT_API);
  assert.equal(apiBase({ VITE_EVENTS_API_URL: "   " }), DEFAULT_API);
  assert.equal(
    apiBase({ VITE_EVENTS_API_URL: "http://127.0.0.1:3000" }),
    "http://127.0.0.1:3000"
  );
  assert.equal(
    apiBase({ VITE_EVENTS_API_URL: "https://hardcall-api.onrender.com/" }),
    "https://hardcall-api.onrender.com"
  );
  assert.equal(
    apiBase({ VITE_EVENTS_API_URL: "https://hardcall-api.onrender.com/api/events" }),
    "https://hardcall-api.onrender.com"
  );
});

test("apiBase rejects non-http(s) and unparseable values", () => {
  assert.equal(apiBase({ VITE_EVENTS_API_URL: "javascript:alert(1)" }), DEFAULT_API);
  assert.equal(apiBase({ VITE_EVENTS_API_URL: "not-a-url" }), DEFAULT_API);
  assert.equal(apiBase({ VITE_EVENTS_API_URL: "ftp://example.com" }), DEFAULT_API);
});

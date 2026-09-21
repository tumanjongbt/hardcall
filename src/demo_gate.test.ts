import assert from "node:assert/strict";
import { test } from "node:test";
import { allowDemoFromEnv, isDemoEventSource, isDemoInsightSource } from "./demo_gate";

test("allowDemoFromEnv defaults off in production", () => {
  assert.equal(allowDemoFromEnv({ NODE_ENV: "production" }), false);
  assert.equal(allowDemoFromEnv({ NODE_ENV: "production", HARDCALL_ALLOW_DEMO: "true" }), true);
  assert.equal(allowDemoFromEnv({ NODE_ENV: "development" }), true);
  assert.equal(allowDemoFromEnv({ NODE_ENV: "development", HARDCALL_ALLOW_DEMO: "false" }), false);
  assert.equal(isDemoEventSource("playground"), true);
  assert.equal(isDemoEventSource("scorecard"), false);
  assert.equal(isDemoInsightSource("synthetic"), true);
  assert.equal(isDemoInsightSource("bls"), false);
});

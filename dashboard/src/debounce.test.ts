import assert from "node:assert/strict";
import { test } from "node:test";
import { debounce } from "./debounce";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("debounce waits the full interval and keeps the last call", async () => {
  const calls: string[] = [];
  const run = debounce((value: string) => {
    calls.push(value);
  }, 300);

  run("w");
  run("we");
  run("welding");
  await delay(250);
  assert.deepEqual(calls, []);
  await delay(80);
  assert.deepEqual(calls, ["welding"]);
});

test("debounce cancel prevents the pending call", async () => {
  const calls: string[] = [];
  const run = debounce((value: string) => {
    calls.push(value);
  }, 300);
  run("x");
  run.cancel();
  await delay(350);
  assert.deepEqual(calls, []);
});

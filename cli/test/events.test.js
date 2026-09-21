"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const { DEFAULT_API_URL, main } = require("../src/events");

const bin = path.resolve(__dirname, "../src/events.js");

function capture() {
  return {
    out: "",
    write(chunk) {
      this.out += chunk;
    },
  };
}

test("help exits 0", async () => {
  const stdout = capture();
  const stderr = capture();
  const code = await main(["--help"], { stdout, stderr });
  assert.equal(code, 0);
  assert.match(stdout.out, /events push/);
});

test("missing command exits 1", async () => {
  const stdout = capture();
  const stderr = capture();
  const code = await main([], { stdout, stderr });
  assert.equal(code, 1);
  assert.match(stderr.out, /Usage:/);
});

test("invalid channel exits 1 without calling the API", async () => {
  let called = false;
  const stderr = capture();
  const code = await main(
    ["push", "--channel", "nope", "--title", "x"],
    {
      fetch: async () => {
        called = true;
        return { status: 201, text: async () => "{}" };
      },
      stdout: capture(),
      stderr,
    }
  );
  assert.equal(code, 1);
  assert.equal(called, false);
  assert.match(stderr.out, /invalid channel/);
});

test("push maps --icon/--tags and prints 201 JSON", async () => {
  /** @type {{ url?: string, init?: RequestInit }} */
  let captured = {};
  const stdout = capture();
  const row = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    channel: "university",
    title: "CS salaries",
    description: "optional",
    emoji: "📈",
    tags: ["college_students", "parents"],
    created_at: "2026-09-20T23:56:00.000Z",
  };
  const code = await main(
    [
      "push",
      "--channel",
      "university",
      "--title",
      "CS salaries",
      "--description",
      "optional",
      "--icon",
      "📈",
      "--tags",
      "college_students, parents",
    ],
    {
      fetch: async (url, init) => {
        captured = { url, init };
        return { status: 201, text: async () => JSON.stringify(row) };
      },
      stdout,
      stderr: capture(),
    }
  );
  assert.equal(code, 0);
  assert.equal(captured.url, `${DEFAULT_API_URL}/api/events`);
  assert.deepEqual(JSON.parse(String(captured.init?.body)), {
    channel: "university",
    title: "CS salaries",
    description: "optional",
    emoji: "📈",
    tags: ["college_students", "parents"],
  });
  assert.equal(stdout.out, `${JSON.stringify(row)}\n`);
});

test("--api-url wins over EVENTS_API_URL", async () => {
  /** @type {string | undefined} */
  let url;
  const code = await main(
    [
      "push",
      "--channel",
      "trade",
      "--title",
      "HVAC",
      "--api-url",
      "http://127.0.0.1:3999/",
    ],
    {
      env: { EVENTS_API_URL: "https://example.invalid" },
      fetch: async (u) => {
        url = u;
        return { status: 201, text: async () => "{}" };
      },
      stdout: capture(),
      stderr: capture(),
    }
  );
  assert.equal(code, 0);
  assert.equal(url, "http://127.0.0.1:3999/api/events");
});

test("EVENTS_API_URL is used when --api-url is omitted", async () => {
  /** @type {string | undefined} */
  let url;
  const code = await main(["push", "--channel", "automation", "--title", "AI"], {
    env: { EVENTS_API_URL: "http://localhost:3000" },
    fetch: async (u) => {
      url = u;
      return { status: 201, text: async () => "{}\n" };
    },
    stdout: capture(),
    stderr: capture(),
  });
  assert.equal(code, 0);
  assert.equal(url, "http://localhost:3000/api/events");
});

test("non-201 exits 1 and prints the body on stderr", async () => {
  const stderr = capture();
  const code = await main(["push", "--channel", "trade", "--title", "x"], {
    fetch: async () => ({
      status: 400,
      text: async () => '{"error":"validation_failed"}',
    }),
    stdout: capture(),
    stderr,
  });
  assert.equal(code, 1);
  assert.match(stderr.out, /HTTP 400/);
  assert.match(stderr.out, /validation_failed/);
});

test("network failure exits 1", async () => {
  const stderr = capture();
  const code = await main(["push", "--channel", "trade", "--title", "x"], {
    fetch: async () => {
      throw new Error("ECONNREFUSED");
    },
    stdout: capture(),
    stderr,
  });
  assert.equal(code, 1);
  assert.match(stderr.out, /ECONNREFUSED/);
});

test("bin --help prints usage", async () => {
  const { stdout, status } = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, "--help"]);
    let out = "";
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout: out, status: code }));
  });
  assert.equal(status, 0);
  assert.match(stdout, /Usage: events push/);
});

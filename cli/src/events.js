#!/usr/bin/env node
"use strict";

const { parseArgs } = require("node:util");

const CHANNELS = [
  "university",
  "community_college",
  "trade",
  "apprenticeship",
  "automation",
];

const TAGS = [
  "high_school_students",
  "college_students",
  "parents",
  "career_counselors",
  "workforce_training_managers",
];

const DEFAULT_API_URL = "https://hardcall-api.onrender.com";

function usage() {
  return `Usage: events push --channel <CHANNEL> --title <TITLE> [options]

Push one event to POST /api/events.

Options:
  --channel <CHANNEL>     one of: ${CHANNELS.join(" | ")}
  --title <TITLE>         event title
  --description <DESC>    optional description
  --icon <EMOJI>          maps to API field emoji
  --tags <TAGS>           comma-separated stakeholder tags
  --api-url <URL>         API base URL (default EVENTS_API_URL or ${DEFAULT_API_URL})
  -h, --help              show help

Tags: ${TAGS.join(" | ")}
`;
}

/**
 * @param {string[]} argv
 * @param {{
 *   fetch?: typeof fetch,
 *   env?: NodeJS.ProcessEnv,
 *   stdout?: { write(chunk: string): unknown },
 *   stderr?: { write(chunk: string): unknown },
 * }} [io]
 * @returns {Promise<number>}
 */
async function main(argv, io = {}) {
  const fetchImpl = io.fetch ?? globalThis.fetch;
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        channel: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        icon: { type: "string" },
        tags: { type: "string" },
        "api-url": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  if (values.help) {
    stdout.write(usage());
    return 0;
  }

  if (positionals.length !== 1 || positionals[0] !== "push") {
    stderr.write(usage());
    return 1;
  }

  if (!values.channel || !values.title) {
    stderr.write("error: --channel and --title are required\n");
    return 1;
  }

  if (!CHANNELS.includes(values.channel)) {
    stderr.write(
      `error: invalid channel '${values.channel}' (expected ${CHANNELS.join("|")})\n`
    );
    return 1;
  }

  /** @type {string[] | undefined} */
  let tags;
  if (values.tags !== undefined) {
    tags = values.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const seen = new Set();
    for (const tag of tags) {
      if (!TAGS.includes(tag)) {
        stderr.write(
          `error: invalid tag '${tag}' (expected ${TAGS.join("|")})\n`
        );
        return 1;
      }
      if (seen.has(tag)) {
        stderr.write("error: tags must be unique\n");
        return 1;
      }
      seen.add(tag);
    }
  }

  /** @type {Record<string, unknown>} */
  const body = {
    channel: values.channel,
    title: values.title,
  };
  if (values.description !== undefined) body.description = values.description;
  if (values.icon !== undefined) body.emoji = values.icon;
  if (tags !== undefined) body.tags = tags;

  const base = String(
    values["api-url"] || env.EVENTS_API_URL || DEFAULT_API_URL
  ).replace(/\/+$/, "");
  const url = `${base}/api/events`;

  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    stderr.write(
      `error: request failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return 1;
  }

  const text = await res.text();
  if (res.status !== 201) {
    stderr.write(`error: HTTP ${res.status}\n`);
    if (text) stderr.write(`${text.endsWith("\n") ? text : `${text}\n`}`);
    return 1;
  }

  stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  return 0;
}

module.exports = {
  CHANNELS,
  DEFAULT_API_URL,
  TAGS,
  main,
  usage,
};

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exit(code);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}

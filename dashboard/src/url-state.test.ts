import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultViewState,
  hrefForState,
  parseCompare,
  parseForecast,
  parseLens,
  parseRange,
  parseViewState,
  serializeViewState,
} from "./url-state";

test("parseViewState reads bookmark query keys", () => {
  assert.deepEqual(
    parseViewState("?page=2&perPage=50&channel=trade&q=welding"),
    {
      tab: "events",
      page: 2,
      perPage: 50,
      channel: "trade",
      q: "welding",
      insight: null,
      lens: null,
      range: 30,
      forecast: 14,
      compare: ["trade", "university"],
      state: null,
      cip: null,
      outlook: null,
    }
  );
  assert.equal(parseViewState("?tab=insights").tab, "insights");
  assert.equal(parseViewState("?tab=charts").tab, "charts");
  assert.equal(parseViewState("?tab=playground").tab, "playground");
  assert.equal(parseViewState("?tab=admin").tab, "admin");
  assert.equal(parseViewState("?tab=seed").tab, "admin");
  assert.deepEqual(parseViewState("?tab=insights&insight=abc-1").insight, "abc-1");
  assert.equal(parseViewState("?insight=abc-1").tab, "insights");
});

test("parseViewState restores defaults and ignores unknown channels", () => {
  assert.deepEqual(parseViewState(""), defaultViewState());
  assert.deepEqual(parseViewState("?page=0&perPage=25&channel=nope&q=%20"), {
    tab: "events",
    page: 1,
    perPage: 50,
    channel: null,
    q: "",
    insight: null,
    lens: null,
    range: 30,
    forecast: 14,
    compare: ["trade", "university"],
    state: null,
    cip: null,
    outlook: null,
  });
  assert.equal(parseViewState("?perPage=100").perPage, 100);
  assert.equal(parseViewState("?perPage=all").perPage, "all");
});

test("parseViewState reads lens, stakeholder alias, range, and compare", () => {
  const parsed = parseViewState(
    "?tab=charts&lens=parents&range=7&compare=trade,automation"
  );
  assert.equal(parsed.lens, "parents");
  assert.equal(parsed.range, 7);
  assert.deepEqual(parsed.compare, ["trade", "automation"]);
  assert.equal(parseViewState("?stakeholder=career_counselors").lens, "counselors");
  assert.equal(parseViewState("?lens=students").lens, "students");
  assert.equal(parseViewState("?lens=high_school_students").lens, "students");
  assert.equal(parseViewState("?stakeholder=workforce_training_managers").lens, "workforce");
  assert.equal(parseViewState("?range=14").range, 14);
  assert.equal(parseViewState("?range=90").range, 90);
  assert.equal(parseViewState("?range=99").range, 30);
  assert.equal(parseViewState("?forecast=30").forecast, 30);
  assert.equal(parseViewState("?forecast=14").forecast, 14);
  assert.equal(parseViewState("?forecast=7").forecast, 14);
  assert.deepEqual(parseViewState("?compare=none").compare, []);
  assert.deepEqual(parseViewState("?compare=trade").compare, ["trade"]);
  assert.equal(parseViewState("?state=ca&cip=11.07&outlook=grow").state, "CA");
  assert.equal(parseViewState("?state=ca&cip=11.07&outlook=grow").cip, "11.07");
  assert.equal(parseViewState("?outlook=decline").outlook, "decline");
  assert.equal(parseViewState("?outlook=nope").outlook, null);
  assert.equal(
    hrefForState({
      ...defaultViewState(),
      state: "CA",
      cip: "welding",
      outlook: "grow",
    }),
    "/?page=1&perPage=50&state=CA&cip=welding&outlook=grow"
  );
});

test("parseLens and parseRange and parseCompare helpers", () => {
  assert.equal(parseLens(null), null);
  assert.equal(parseLens("all"), null);
  assert.equal(parseLens("counselors"), "counselors");
  assert.equal(parseRange("7"), 7);
  assert.equal(parseRange("90"), 90);
  assert.equal(parseRange("nope"), 30);
  assert.equal(parseForecast("30"), 30);
  assert.equal(parseForecast("nope"), 14);
  assert.deepEqual(parseCompare(null), ["trade", "university"]);
  assert.deepEqual(parseCompare("university,trade,automation"), ["university", "trade"]);
  assert.deepEqual(parseCompare("trade,trade"), ["trade"]);
});

test("serializeViewState writes page, perPage, channel, and q", () => {
  const qs = serializeViewState({
    tab: "events",
    page: 2,
    perPage: 50,
    channel: "trade",
    q: "welding",
    insight: null,
    lens: null,
    range: 30,
    forecast: 14,
    compare: ["trade", "university"],
  });
  assert.equal(qs, "page=2&perPage=50&channel=trade&q=welding");
  assert.equal(
    hrefForState({
      tab: "events",
      page: 1,
      perPage: 100,
      channel: null,
      q: "",
      insight: null,
      lens: null,
      range: 30,
      forecast: 14,
      compare: ["trade", "university"],
    }),
    "/?page=1&perPage=100"
  );
  assert.equal(
    hrefForState({
      tab: "insights",
      page: 1,
      perPage: 50,
      channel: null,
      q: "",
      insight: null,
      lens: null,
      range: 30,
      forecast: 14,
      compare: ["trade", "university"],
    }),
    "/?tab=insights&page=1&perPage=50"
  );
  assert.equal(
    hrefForState({
      tab: "charts",
      page: 1,
      perPage: 50,
      channel: "trade",
      q: "welding",
      insight: null,
      lens: null,
      range: 30,
      forecast: 14,
      compare: ["trade", "university"],
    }),
    "/?tab=charts&page=1&perPage=50&channel=trade&q=welding"
  );
  assert.equal(
    hrefForState({
      tab: "insights",
      page: 1,
      perPage: 50,
      channel: null,
      q: "",
      insight: "abc-1",
      lens: null,
      range: 30,
      forecast: 14,
      compare: ["trade", "university"],
    }),
    "/?tab=insights&page=1&perPage=50&insight=abc-1"
  );
  assert.equal(
    hrefForState({
      tab: "playground",
      page: 1,
      perPage: 50,
      channel: null,
      q: "",
      insight: null,
    }),
    "/?tab=playground&page=1&perPage=50"
  );
  assert.equal(
    hrefForState({
      tab: "admin",
      page: 1,
      perPage: 50,
      channel: null,
      q: "",
      insight: null,
    }),
    "/?tab=admin&page=1&perPage=50"
  );
});

test("serializeViewState writes lens, range, and compare when not default", () => {
  assert.equal(
    hrefForState({
      tab: "charts",
      page: 1,
      perPage: 50,
      channel: null,
      q: "",
      insight: null,
      lens: "parents",
      range: 7,
      forecast: 14,
      compare: ["university", "automation"],
    }),
    "/?tab=charts&page=1&perPage=50&lens=parents&range=7&compare=university%2Cautomation"
  );
  assert.equal(
    hrefForState({
      tab: "charts",
      page: 1,
      perPage: 50,
      channel: null,
      q: "",
      insight: null,
      lens: null,
      range: 90,
      forecast: 30,
      compare: ["trade", "university"],
    }),
    "/?tab=charts&page=1&perPage=50&range=90&forecast=30"
  );
  assert.equal(
    hrefForState({
      tab: "charts",
      page: 1,
      perPage: 50,
      channel: null,
      q: "",
      insight: null,
      lens: null,
      range: 30,
      forecast: 14,
      compare: [],
    }),
    "/?tab=charts&page=1&perPage=50&compare=none"
  );
});

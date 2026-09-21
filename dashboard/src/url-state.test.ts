import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultViewState,
  hrefForState,
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
    }
  );
  assert.equal(parseViewState("?tab=insights").tab, "insights");
  assert.equal(parseViewState("?tab=charts").tab, "charts");
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
  });
  assert.equal(parseViewState("?perPage=100").perPage, 100);
  assert.equal(parseViewState("?perPage=all").perPage, "all");
});

test("serializeViewState writes page, perPage, channel, and q", () => {
  const qs = serializeViewState({
    tab: "events",
    page: 2,
    perPage: 50,
    channel: "trade",
    q: "welding",
    insight: null,
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
    }),
    "/?tab=insights&page=1&perPage=50&insight=abc-1"
  );
});

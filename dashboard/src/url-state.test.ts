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
    }
  );
  assert.equal(parseViewState("?tab=insights").tab, "insights");
});

test("parseViewState restores defaults and ignores unknown channels", () => {
  assert.deepEqual(parseViewState(""), defaultViewState());
  assert.deepEqual(parseViewState("?page=0&perPage=25&channel=nope&q=%20"), {
    tab: "events",
    page: 1,
    perPage: 50,
    channel: null,
    q: "",
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
  });
  assert.equal(qs, "page=2&perPage=50&channel=trade&q=welding");
  assert.equal(
    hrefForState({
      tab: "events",
      page: 1,
      perPage: 100,
      channel: null,
      q: "",
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
    }),
    "/?tab=insights&page=1&perPage=50"
  );
});

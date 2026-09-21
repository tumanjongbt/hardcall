const { validateUpsertInsight } = require("./insights_validate");
const assert = require("node:assert/strict");

function ok(body) {
  const r = validateUpsertInsight(body);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
}

function fail(body, field, rule) {
  const r = validateUpsertInsight(body);
  assert.equal(r.ok, false);
  assert.ok(
    r.details.some((d) => d.field === field && d.rule === rule),
    JSON.stringify(r.details)
  );
}

const trimmed = ok({
  title: "  Top Trade Income Growth  ",
  value: "  +18%  ",
});
assert.equal(trimmed.title, "Top Trade Income Growth");
assert.equal(trimmed.value, "+18%");
assert.equal(trimmed.detail, undefined);
assert.equal(trimmed.source, undefined);

assert.equal(
  ok({ title: "ROI", value: "+6%", source: "synthetic" }).source,
  "synthetic"
);

const withDetail = ok({
  title: "Highest Tuition Payload",
  value: "Traditional 4-Year University",
  detail: "  Four-year sticker cost stays the heaviest payload.\nCounselors should stack aid.  ",
});
assert.equal(
  withDetail.detail,
  "Four-year sticker cost stays the heaviest payload.\nCounselors should stack aid."
);

const blankDetail = ok({ title: "ROI", value: "+6%", detail: "   " });
assert.equal(blankDetail.detail, "");

fail({ value: "+18%" }, "title", "required");
fail({ title: "ROI" }, "value", "required");
fail({ title: "", value: "+18%" }, "title", "length_1_200");
fail({ title: "ROI", value: "" }, "value", "length_1_500");
fail({ title: "ROI", value: "+18%", extra: 1 }, "extra", "unknown_key");
fail({ title: 12, value: "+18%" }, "title", "string");
fail({ title: "ROI", value: "+18%", detail: 9 }, "detail", "string");
fail({ title: "ROI", value: "+18%", detail: "x".repeat(8001) }, "detail", "length_0_8000");
fail({ title: "ROI", value: "+18%", source: "playground" }, "source", "enum");
fail({ title: "ROI", value: "+18%", source: "bls" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "onet" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "scorecard" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "apprenticeship_gov" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "bls_ep" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "ipeds" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "careeronestop" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "census" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "bea" }, "source", "reserved");
fail({ title: "ROI", value: "+18%", source: "fred" }, "source", "reserved");
fail(null, "_", "object_required");

console.log("insights_validate: ok");

/** Reserved live sources — adapter/worker only. Anonymous POST cannot mint these. */

const LIVE_SOURCES = Object.freeze([
  "bls",
  "onet",
  "scorecard",
  "apprenticeship_gov",
  "bls_ep",
  "ipeds",
  "careeronestop",
  "census",
  "bea",
  "fred",
]);

const LIVE_SOURCE_SET = new Set(LIVE_SOURCES);

module.exports = {
  LIVE_SOURCES,
  LIVE_SOURCE_SET,
};

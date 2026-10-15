// Tests for the goalie-pull advisor.   node --test scripts/pullAdvisor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { advise, pullWindow, pTie } from "./pullAdvisor.mjs";

const rates = JSON.parse(readFileSync(new URL("../model/qotd.json", import.meta.url))).questions.find((q) => q.id === "pull").rates;
const g = (o) => ({ period: 3, periodType: "REG", secondsLeft: 200, inIntermission: false, homeScore: 2, awayScore: 3, situationCode: "1551", home: "DET", away: "BOS", ...o });

test("window matches the published answer (down one: about 2:20-4:40)", () => {
  const w = pullWindow(1, rates); assert.ok(w.lo >= 120 && w.lo <= 160, `lo ${w.lo}`); assert.ok(w.hi >= 260 && w.hi <= 300, `hi ${w.hi}`);
});
test("pulling at some point beats never pulling", () => { assert.ok(pTie(1, 180, 600, rates) > pTie(1, 0, 600, rates)); });
test("status: early, window, late, pulled", () => {
  assert.equal(advise(g({ secondsLeft: 600 }), rates).status, "early");
  assert.equal(advise(g({ secondsLeft: 200 }), rates).status, "window");
  assert.equal(advise(g({ secondsLeft: 60 }), rates).status, "late");
  assert.equal(advise(g({ secondsLeft: 60, situationCode: "1560" }), rates).status, "pulled"); // home goalie out, 6 skaters
});
test("the trailing team is identified from the score", () => {
  assert.equal(advise(g({ homeScore: 3, awayScore: 2, situationCode: "0651" }), rates).team, "BOS");
});
test("quiet when it doesn't apply", () => {
  assert.equal(advise(g({ period: 2 }), rates), null);
  assert.equal(advise(g({ homeScore: 3, awayScore: 3 }), rates), null);
  assert.equal(advise(g({ homeScore: 1, awayScore: 4 }), rates), null); // down three
  assert.equal(advise(g({ situationCode: "1451" }), rates), null); // power play
  assert.equal(advise(g({ inIntermission: true }), rates), null);
  assert.equal(advise(g({ periodType: "OT" }), rates), null);
});

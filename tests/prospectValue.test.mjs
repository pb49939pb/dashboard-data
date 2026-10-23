// The nightly's JavaScript prospect model must reproduce hockey-models prospects.py exactly (fixtures written by it).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prospectExpected } from "../scripts/prospectValue.mjs";

const model = JSON.parse(await readFile(new URL("../model/prospects.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(await readFile(new URL("./fixtures/prospects.json", import.meta.url), "utf8"));

test("matches the Python model on its fixtures", () => {
  assert.ok(fixtures.length >= 20);
  for (const f of fixtures) {
    const r = prospectExpected(model, f.rows, f);
    assert.equal(r.k, f.k);
    assert.ok(Math.abs(r.wins - f.expected) < 1e-6, `${f.draftYear} #${f.overall} k=${f.k}: ${r.wins} vs ${f.expected}`);
  }
});

test("goalies and undrafted players get no production value", () => {
  assert.equal(prospectExpected(model, [], { draftYear: 2024, overall: 20, pos: "G", curStart: 2026 }), null);
  assert.equal(prospectExpected(model, [], { draftYear: null, overall: null, pos: "C", curStart: 2026 }), null);
});

test("the season in progress is never used", () => {
  const rows = [{ season: 20252026, league: "SHL", gp: 52, pts: 40 }];
  const a = prospectExpected(model, rows, { draftYear: 2023, overall: 43, pos: "C", birthDate: "2005-06-22", curStart: 2026 });
  const b = prospectExpected(model, [...rows, { season: 20262027, league: "AHL", gp: 5, pts: 9 }], { draftYear: 2023, overall: 43, pos: "C", birthDate: "2005-06-22", curStart: 2026 });
  assert.equal(a.wins, b.wins);
  assert.equal(a.season, 20252026);
});

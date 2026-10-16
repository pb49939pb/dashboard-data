// node --test scripts/capwages.test.mjs
// Synthetic payloads follow the shapes in docs/capwages-integration.md. The real payloads from the brief
// (player-connor-mcdavid.json, player-oliver-ekman-larsson.json, lineup-detroit-red-wings.json) are tested too when
// they're in scripts/fixtures/capwages/ (skipped otherwise). Numbers here are public reporting, not imported data.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { teamAbbrev, lineupSlug, seasonStart, normalizeRetention, normalizePlayer, teamCharges, validate, teamDoc, TEAMS } from "./capwages-lib.mjs";

const season = (s, o = {}) => ({ season: s, clause: null, capHit: 1_000_000, aav: 1_000_000, performanceBonuses: 0, signingBonuses: 0, baseSalary: 1_000_000, totalSalary: 1_000_000, minorsSalary: null, ...o });
const player = (slug, team, contracts, o = {}) => ({ slug, name: slug, nhlId: o.nhlId ?? Math.abs([...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)), team: { slug: team }, position: "C", leagueStatus: o.status ?? "NHL", contracts });

test("team names and slugs in every spelling", () => {
  assert.equal(teamAbbrev("anaheim_ducks"), "ANA");
  assert.equal(teamAbbrev("detroit-red-wings"), "DET");
  assert.equal(teamAbbrev("Utah Hockey Club"), "UTA");
  assert.equal(teamAbbrev("Montréal Canadiens"), "MTL");
  assert.equal(teamAbbrev("Springfield Ice"), null);
  assert.equal(lineupSlug("DET"), "detroit-red-wings");
  assert.equal(lineupSlug("STL"), "st-louis-blues");
  assert.equal(Object.keys(TEAMS).length, 32);
  assert.equal(seasonStart("2026-27"), 2026);
});

test("retention: clean entries pass, the OEL-style encodings are flagged", () => {
  assert.deepEqual(normalizeRetention({ "Utah Hockey Club": { capHit: 120_000, retainedPct: 12 } }).anomaly, false);
  const dup = normalizeRetention({ "Vancouver Canucks": { capHit: 7_260_000, retainedPct: 88 }, "Arizona Coyotes": { capHit: 7_260_000, retainedPct: 88 } });
  assert.equal(dup.anomaly, true);
  assert.ok(dup.reasons.some((r) => r.includes("more than 100")) && dup.reasons.some((r) => r.includes("same percentage")));
  assert.equal(normalizeRetention({ Nowhere: { capHit: 1, retainedPct: 10 } }).anomaly, true); // unknown team: unverified, not ignored
  const bo = { teamName: "Vancouver Canucks", teamSlug: "vancouver-canucks", capHit: 2_346_667 };
  assert.equal(normalizeRetention({ "Vancouver Canucks": { capHit: 7_260_000, retainedPct: 88 }, "Utah Mammoth": { capHit: 320_000, retainedPct: 12 } }, bo).anomaly, true);
  assert.equal(normalizeRetention({ "Utah Mammoth": { capHit: 650_000, retainedPct: 12 } }, bo).anomaly, false); // Utah's share of the buyout
});

test("McDavid-shaped payload: the extension's seasons parse with NMC at 12.5M", () => {
  const p = normalizePlayer(player("connor-mcdavid", "edmonton_oilers", [
    { contractType: "Standard", contractLength: 8, expiryStatus: "UFA", seasons: [season("2025-26", { capHit: 12_500_000, clause: "NMC" })] },
    { contractType: "Standard", contractLength: 2, expiryStatus: "UFA", seasons: [season("2026-27", { capHit: 12_500_000, clause: "NMC", signingBonuses: 11_000_000 }), season("2027-28", { capHit: 12_500_000, clause: "NMC" })] },
  ]));
  assert.equal(p.team, "EDM");
  const ext = [2026, 2027].map((y) => p.seasons[y]);
  assert.ok(ext.every((r) => r.capHit === 12_500_000 && r.clause === "NMC" && r.contract === 1));
});

test("buyout and retention charges land on the right teams; anomalous seasons are unverified, not zero", () => {
  const oel = normalizePlayer(player("oliver-ekman-larsson", "toronto_maple_leafs", [
    { contractType: "Standard", expiryStatus: "UFA", seasons: [
      season("2026-27", { capHit: 7_260_000, retention: { "Vancouver Canucks": { capHit: 7_260_000, retainedPct: 88 }, "Utah Mammoth": { capHit: 7_260_000, retainedPct: 88 } } }),
      season("2027-28", { capHit: 0, buyout: { teamName: "Vancouver Canucks", teamSlug: "vancouver-canucks", cost: 1, earning: 1, savings: 1, capHit: 146_667 } }),
    ] },
    { contractType: "Standard", expiryStatus: "UFA", seasons: [season("2027-28", { capHit: 3_500_000 })] },
  ]));
  const y26 = teamCharges([oel], 2026);
  assert.equal(y26.TOR.players.length, 0);
  assert.ok(["TOR", "VAN", "UTA"].every((t) => y26[t].unverified.length === 1));
  const y27 = teamCharges([oel], 2027);
  assert.equal(y27.VAN.totals.buyouts, 146_667);
  assert.equal(y27.TOR.totals.players, 3_500_000); // the overlapping new deal still counts for his team
  const kept = normalizePlayer(player("x", "toronto_maple_leafs", [{ seasons: [season("2026-27", { capHit: 5_000_000, retention: { "Ottawa Senators": { capHit: 1_250_000, retainedPct: 25 } } })] }]));
  const c = teamCharges([kept], 2026);
  assert.equal(c.TOR.totals.players, 3_750_000);
  assert.equal(c.OTT.totals.retained, 1_250_000);
});

test("cap counting: roster and injured lists in full, minors buried above the threshold, prospects not at all", () => {
  const mk = (slug, status, cap) => ({ ...normalizePlayer(player(slug, "detroit_red_wings", [{ seasons: [season("2026-27", { capHit: cap })] }])), leagueStatus: status });
  const c = teamCharges([mk("a", "NHL", 5_000_000), mk("b", "LTIR", 3_000_000), mk("c", "Minor", 1_500_000), mk("d", "Minor", 900_000), mk("e", "Prospect", 950_000)], 2026).DET;
  assert.equal(c.totals.players, 5_000_000 + 3_000_000 + (1_500_000 - 1_225_000));
  assert.equal(c.totals.ltir, 3_000_000);
});

test("overlapping contracts: the newest counts once, the difference is kept for the verdict", () => {
  const k = normalizePlayer(player("kreider", "montreal_canadiens", [{ contractType: "35+ Contract", seasons: [season("2026-27", { capHit: 2_150_000 })] }, { contractType: "Standard Contract (Extension)", seasons: [season("2026-27", { capHit: 6_500_000 })] }]));
  const c = teamCharges([k], 2026).MTL;
  assert.equal(c.totals.players, 2_150_000);
  assert.equal(c.totals.overlapAlt, 4_350_000);
});

test("league doc: retention counts for the CBA limits", async () => {
  const { leagueDoc } = await import("./capwages-lib.mjs");
  const mk = (slug, team, ret) => normalizePlayer(player(slug, team, [{ contractType: "Standard Contract", seasons: [season("2026-27", { capHit: 5_000_000, retention: ret })] }]));
  const ps = [mk("a", "toronto_maple_leafs", { "Ottawa Senators": { capHit: 1_250_000, retainedPct: 25 } }), mk("b", "boston_bruins", { "Ottawa Senators": { capHit: 500_000, retainedPct: 10 }, "Buffalo Sabres": { capHit: 750_000, retainedPct: 15 } })];
  const L = leagueDoc(ps, [2026, 2027], { importedAt: "x" });
  assert.equal(L.teams.OTT[2026].retainedN, 2);
  assert.deepEqual(L.players.find((p) => p.team === "BOS").retBy, ["OTT", "BUF"]);
});

test("a rostered player without a contract this season: warned, and his last deal is kept", async () => {
  const { leagueDoc } = await import("./capwages-lib.mjs");
  const p = normalizePlayer(player("edvinsson", "detroit_red_wings", [{ contractType: "Entry-Level Contract", expiryStatus: "RFA", seasons: [season("2025-26", { capHit: 894_167 })] }]));
  const L = leagueDoc([p], [2026, 2027], { importedAt: "x" });
  assert.deepEqual(L.players[0].lastDeal, { end: 2025, expiry: "RFA" });
  const v = validate({ players: [p], errors: 0, attempted: 1, y: 2026, prev: null }, []);
  assert.ok(v.warnings.some((w) => /no contract for 2026-27/.test(w) && /edvinsson \(DET\)/.test(w)));
});

test("validation fails closed: missing spot checks, bad team counts, error rate, swings in player count", () => {
  const many = Object.keys(TEAMS).flatMap((a) => Array.from({ length: 20 }, (_, i) => normalizePlayer(player(`${a}-${i}`, TEAMS[a], [{ seasons: [season("2026-27", { capHit: 4_000_000 })] }]))));
  const v = validate({ players: many, errors: 0, attempted: many.length, y: 2026, prev: null });
  assert.equal(v.ok, false); // the three spot-check players aren't in this synthetic set
  assert.ok(v.failures.every((f) => f.startsWith("spot check")));
  const ok = validate({ players: many, errors: 0, attempted: many.length, y: 2026, prev: null }, []);
  assert.equal(ok.ok, true);
  assert.equal(validate({ players: many, errors: 10, attempted: many.length, y: 2026, prev: null }, []).ok, false); // 10/640 > 1%
  assert.equal(validate({ players: many, errors: 0, attempted: many.length, y: 2026, prev: { nhlPlayers: 900 } }, []).ok, false);
  assert.equal(validate({ players: many.filter((p) => p.team !== "SEA"), errors: 0, attempted: 1, y: 2026, prev: null }, []).ok, false);
  const doc = teamDoc("DET", many, [2026, 2027], { lastUpdated: "x", importedAt: "y" });
  assert.equal(doc.players.length, 20);
  assert.equal(doc.charges[2026].totals.players, 80_000_000);
});

const FX = new URL("./fixtures/capwages/", import.meta.url);
const fx = (n) => { const f = new URL(n, FX); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const body = (j) => j?.data ?? j;
test("real fixture: McDavid", { skip: !fx("player-connor-mcdavid.json") && "fixture not added yet" }, () => {
  const p = normalizePlayer(body(fx("player-connor-mcdavid.json")));
  const nmc = Object.values(p.seasons).flat().filter((r) => r.capHit === 12_500_000 && r.clause === "NMC" && r.contract === p.contracts.length - 1);
  assert.equal(nmc.length >= 2, true);
});
test("real fixture: Ekman-Larsson buyout schedule and retention anomaly", { skip: !fx("player-oliver-ekman-larsson.json") && "fixture not added yet" }, () => {
  const p = normalizePlayer(body(fx("player-oliver-ekman-larsson.json")));
  const want = { 2023: 146_667, 2024: 2_346_667, 2025: 4_766_667, 2026: 4_766_667, 2027: 2_126_667 };
  for (const [y, v] of Object.entries(want)) assert.equal([].concat(p.seasons[y] || []).find((r) => r.buyout)?.buyout.capHit, v, `buyout ${y}`);
  assert.ok(Object.values(p.seasons).flat().some((r) => r.retentionAnomaly), "the early seasons' retention is flagged");
});
test("real fixture: Detroit lineup has 23 players", { skip: !fx("lineup-detroit-red-wings.json") && "fixture not added yet" }, () => {
  assert.equal(body(fx("lineup-detroit-red-wings.json")).players.length, 23);
});

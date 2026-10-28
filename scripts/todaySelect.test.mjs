// Unit tests for Hockey Lab / Today's selectors (the cases listed in the Today spec, section 12).   node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectGameStory, selectTeamStory, selectQuestionStory, buildTodayEdition, validateEdition, gameCandidate } from "./todaySelect.mjs";

const recap = (o) => ({ id: 2026020100, season: "20262027", date: "2026-10-14", final: true, version: 3, end: "REG", home: { team: "DET", score: 3 }, away: { team: "BOS", score: 2 }, deserved: 0.5, totals: { xg: [3, 3] }, ...o });
const ctx = (o) => ({ editionDateET: "2026-10-15", generatedAt: "2026-10-15T07:00:00Z", recaps: [], teams: [], ...o });

test("winner with replay p=0.28 is a surprise and is selected", () => {
  const r = selectGameStory(ctx({ recaps: [recap({ deserved: 0.28 }), recap({ id: 2026020101, deserved: 0.7 })] })).item;
  assert.equal(r.template, "game_surprise_v1"); assert.equal(r.facts.winnerReplayP, 0.28); assert.equal(r.destination.gameId, 2026020100);
});
test("winner with p=0.49 is not called misleading", () => {
  const r = selectGameStory(ctx({ recaps: [recap({ deserved: 0.49 })] })).item;
  assert.equal(r.template, "game_neutral_v1");
});
test("away winner uses 1 - home replay probability", () => {
  const r = selectGameStory(ctx({ recaps: [recap({ deserved: 0.8, home: { team: "DET", score: 1 }, away: { team: "BOS", score: 4 } })] })).item;
  assert.equal(r.facts.winner, "BOS"); assert.equal(r.facts.winnerReplayP, 0.2);
});
test("invalid probabilities, missing ids and non-final games are rejected", () => {
  for (const bad of [recap({ deserved: NaN }), recap({ deserved: -0.1 }), recap({ deserved: 1.2 }), recap({ id: null }), recap({ final: false })]) assert.ok(gameCandidate(bad).reject);
});
test("shootout games are excluded from surprise selection", () => {
  const out = selectGameStory(ctx({ recaps: [recap({ end: "SO", deserved: 0.1 })] }));
  assert.equal(out.item, null); assert.match(out.log[0].reject, /shootout/);
});
test("no games yesterday: latest date within 72h, relabelled", () => {
  const r = selectGameStory(ctx({ recaps: [recap({ date: "2026-10-13", deserved: 0.3 })] })).item;
  assert.equal(r.label, "From the latest games"); assert.equal(r.lastNight, false); assert.equal(r.asOf, "2026-10-13");
});
test("nothing within the lookback: no game item", () => {
  assert.equal(selectGameStory(ctx({ recaps: [recap({ date: "2026-10-09", deserved: 0.3 })] })).item, null);
});
test("ties break by higher total xG, then game id", () => {
  const r = selectGameStory(ctx({ recaps: [recap({ id: 5, deserved: 0.3, totals: { xg: [1, 1] } }), recap({ id: 6, deserved: 0.3, totals: { xg: [3, 3] } })] })).item;
  assert.equal(r.destination.gameId, 6);
});
const team = (o) => ({ team: "AAA", gp: 18, pts: 21, xgf5: 46, xga5: 54, ...o });
test("GP 14, pts .700, xG .420: not called an overperformer (early season)", () => {
  const r = selectTeamStory(ctx({ teams: [team({ gp: 14, pts: 20, xgf5: 42, xga5: 58 })] })).item;
  assert.equal(r.template, "team_early_v1");
});
test("GP 18, pts .580, xG .460: eligible mismatch", () => {
  const r = selectTeamStory(ctx({ teams: [team({ gp: 18, pts: 21, xgf5: 46, xga5: 54 })] })).item;
  assert.equal(r.template, "team_mismatch_v1"); assert.equal(r.facts.team, "AAA");
});
test("GP 18, pts .580, xG .520: not eligible -> 'mostly agree'", () => {
  const r = selectTeamStory(ctx({ teams: [team({ xgf5: 52, xga5: 48 })] })).item;
  assert.equal(r.template, "team_agree_v1");
});
test("two equally ranked teams break by team id", () => {
  const r = selectTeamStory(ctx({ teams: [team({ team: "ZZZ" }), team({ team: "BBB" })] })).item;
  assert.equal(r.facts.team, "BBB");
});
test("question uses the footer's day rule, and is missing gracefully", () => {
  const q = { start: "2026-10-15", questions: Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, q: `Question ${i}?` })) };
  assert.equal(selectQuestionStory(ctx({ qotd: q, editionDateET: "2026-10-17" })).item.facts.question, "Question 2?");
  assert.equal(selectQuestionStory(ctx({ qotd: q, editionDateET: "2026-10-14" })).item.facts.question, "Question 0?"); // before the start date: question 1
  const ed = buildTodayEdition(ctx({ recaps: [recap({ deserved: 0.3 })] })).edition;
  assert.equal(ed.items.length, 1); assert.equal(ed.items[0].kind, "game");
});
test("a dated question shows on its day only and the rotation pauses", () => {
  const q = { start: "2026-10-15", questions: [...Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, q: `Question ${i}?` })), { id: "d", q: "Dated?", date: "2026-10-17" }] };
  const on = (day) => selectQuestionStory(ctx({ qotd: q, editionDateET: day })).item.facts.questionId;
  assert.deepEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"].map(on), ["q0", "q1", "d", "q2", "q0", "q1"]);
  assert.equal(buildTodayEdition(ctx({ qotd: q })).edition.qotd.questions[3].date, "2026-10-17"); // the copy keeps the date
});
test("identical inputs give an identical edition (idempotent)", () => {
  const c = ctx({ recaps: [recap({ deserved: 0.3 }), recap({ id: 7, deserved: 0.35 })], teams: [team()] });
  assert.deepEqual(buildTodayEdition(c).edition, buildTodayEdition(c).edition);
});
test("validation blocks placeholders, non-finite numbers and private fields", () => {
  const ed = buildTodayEdition(ctx({ recaps: [recap({ deserved: 0.3 })] })).edition;
  assert.deepEqual(validateEdition(ed), []);
  assert.ok(validateEdition({ ...ed, items: [{ ...ed.items[0], facts: { winner: "TEAM_ID" } }] }).length);
  assert.ok(validateEdition({ ...ed, items: [{ ...ed.items[0], facts: { capHit: 1 } }] }).length);
  assert.ok(validateEdition({ ...ed, items: [{ ...ed.items[0], facts: { p: NaN } }] }).length);
});

test("question bank wraps and First to Three is next on October 19", async () => {
 const {readFile}=await import('node:fs/promises');
 const qotd=JSON.parse(await readFile(new URL('../model/qotd.json',import.meta.url),'utf8'));
 // wrap days follow the undated bank's length (a question scheduled later lengthens it: Oct 21 power play, 2026-10-25);
 // the dated Oct 28 goalie question takes its day and pushes the rotation back one day after it (2026-10-28)
 const day=(k)=>new Date(Date.parse(qotd.start+'T00:00:00Z')+k*864e5).toISOString().slice(0,10), undated=qotd.questions.filter(q=>!q.date), n=undated.length;
 for(const [d,id] of [['2026-10-19','first-three'],[day(n),undated[0].id],['2026-10-28','goaliepay'],[day(2*n+1),undated[0].id]]){
  const [day0,id0]=[d,id];
  assert.equal(selectQuestionStory(ctx({qotd,editionDateET:day0})).item.facts.questionId,id0);
 }
});

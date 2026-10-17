// Hockey Lab / Today: build tonight's edition from already-published data and publish it as one small public document.
// Inputs (one release): tonight's league build (public/hockey/league.json), the question bank (model/qotd.json) and the
// published game recaps for the last few Eastern dates (Firestore hockey/recaps/{season}, queried by date).
// Selection is in todaySelect.mjs (pure, unit-tested). Publication is gated by validateEdition(): a failed check keeps
// last night's edition, which the page then labels by its own date instead of calling it today.
//   node scripts/today.mjs            Firestore in/out (FIREBASE_SERVICE_ACCOUNT); without it, public REST in, file out
import { readFile, writeFile } from "node:fs/promises";
import { buildTodayEdition, validateEdition, addDays, TODAY_CONFIG } from "./todaySelect.mjs";

const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const league = await read("public/hockey/league.json"), qotd = await read("model/qotd.json");
if (!league) { console.log("no league build; Today skipped"); process.exit(0); }
const editionDateET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const from = addDays(editionDateET, -Math.ceil(TODAY_CONFIG.lookbackHours / 24)), season = String(league.season);

let db = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  db = getFirestore();
  const { budgetCutoff } = await import("./store.mjs");
  if (await budgetCutoff(db)) { console.log("Firestore budget cutoff is in effect today; Today is built from files only"); db = null; process.env.TODAY_NO_REST = "1"; }
}
async function recapsSince() {
  if (db) {
    const s = await db.collection(`hockey/recaps/${season}`).where("date", ">=", from).get();
    return s.docs.map((d) => JSON.parse(d.data().json));
  }
  if (process.env.TODAY_NO_REST) return []; // cut off: the public REST read would be refused too
  // public REST (recaps are public): local runs without the service account only; with App Check enforced, Firestore refuses it
  // (and the job then builds Today without recent recaps): a structured query on the date field
  const body = { structuredQuery: { from: [{ collectionId: season }], where: { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: from } } } } };
  const r = await fetch("https://firestore.googleapis.com/v1/projects/pat-dashboard-eb494/databases/(default)/documents/hockey/recaps:runQuery", { method: "POST", body: JSON.stringify(body) });
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter((x) => x.document).map((x) => JSON.parse(x.document.fields.json.stringValue));
}
const recaps = (await recapsSince()).filter((r) => r.date < editionDateET);
const ctx = { editionDateET, generatedAt: new Date().toISOString(), recaps, teams: league.teams, teamsAsOf: league.throughDate, qotd,
  inputVersions: { league: league.updatedAt, recaps: recaps.map((r) => r.updatedAt).sort().at(-1) || null, qotd: qotd?.builtAt || null } };
const { edition, log } = buildTodayEdition(ctx);
const errs = validateEdition(edition);
const kinds = edition.items.map((i) => i.template).join(", ") || "none";
if (errs.length) { console.log(`Today ${editionDateET}: NOT published (${errs.length} check failures); last edition kept`); for (const e of errs.slice(0, 5)) console.log(`  ${e}`); process.exit(0); }
const json = JSON.stringify(edition);
await writeFile("public/hockey/today.json", json);
if (db) {
  await db.doc("hockey/today").set({ json, updatedAt: new Date().toISOString() });
  await db.doc(`admin/todayLog/days/${editionDateET}`).set({ json: JSON.stringify({ editionDateET, recaps: recaps.length, log }), updatedAt: new Date().toISOString() });
}
console.log(`Today ${editionDateET}: ${kinds} (${(json.length / 1024).toFixed(1)} KB, ${recaps.length} recaps considered${db ? "" : "; file only"})`);

// Server-side trade search (trades.yml, after the nightly build; Admin "Run now": trade-moves).
// Runs the site's own engine (hockey-web lab.js, as deployed) headlessly over tonight's data and the owner's saved
// edits, for all 32 teams, and stores each team's best deals as ids only in hockey/tradeMoves (owner-only by the
// database rules). The page re-checks those deals in milliseconds instead of searching for seconds, and only when its
// inputs hash (tradeKey in lab.js) matches this run's; otherwise it searches by itself as before.
// It also stores the public versions for signed-out visitors: hockey/tradeBlock (news-only trade block, no contract fields)
// and hockey/tradeMovesPublic (the same search without contracts, cap table or owner edits).
// This repo is public: logs print counts and timings only, never values, names or contract numbers.
//   node scripts/tradeMoves.mjs                 Firestore in, Firestore out (FIREBASE_SERVICE_ACCOUNT)
//   node scripts/tradeMoves.mjs --local [lab]   published JSON files in, nothing written (a smoke test of the harness)
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { startRun } from "./runlog.mjs";

const LAB_URL = "https://patrickreidbaldwin.com/hockey/lab.js";
const local = process.argv.includes("--local");

// lab.js is a browser module: give it just enough of a page to load (it never draws here)
const stub = () => new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.iterator ? function* () {} : k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : stub()),
  apply: () => stub(), construct: () => stub(), set: () => true,
});
const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
define("HOCKEY_HEADLESS", true);
define("document", stub());
define("location", { hostname: "headless", hash: "", pathname: "/hockey/", search: "" });
define("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
define("navigator", {});
define("MutationObserver", class { observe() {} disconnect() {} });
for (const k of ["addEventListener", "removeEventListener", "scrollTo", "requestAnimationFrame"]) define(k, () => 0);
define("scrollY", 0);

async function loadLab() {
  const given = process.argv.slice(2).find((a) => a.endsWith(".js"));
  const src = given ? readFileSync(given, "utf8") : await (await fetch(`${LAB_URL}?v=${Date.now()}`)).text();
  if (!src.includes("headlessTradeMoves")) throw new Error("the deployed lab.js has no headless entry point yet");
  mkdirSync(".cache", { recursive: true });
  const file = `${process.cwd()}/.cache/lab-headless.mjs`;
  writeFileSync(file, src.replace(/await import\("\.\/cloud\.js"\)/g, "null")); // no sign-in here
  return import(pathToFileURL(file).href);
}

/** The contract list with every money field and source left out (public): what availability and contract length need. */
function publicTerms(c) {
  const keep = (r) => ({ id: r.id, team: r.team ?? null, status: r.status ?? null, start: r.start ?? null, end: r.end ?? null, term: r.term ?? null, elc: !!r.elc, signed: r.signed ?? null, born: r.born ?? null,
    ...(r.next ? { next: { start: r.next.start ?? null, end: r.next.end ?? null, term: r.next.term ?? null, signed: r.next.signed ?? null, reported: !!r.next.reported } } : {}) });
  return { builtAt: new Date().toISOString(), season: c.season, players: (c.players || []).filter((r) => !r.removed).map(keep) };
}
const NAMES = ["league", "projections", "assets", "playerValue", "playerProjections", "config", "contracts", "teamCap"];
const t0 = Date.now();
const run = local ? null : startRun("trade-moves");
const lab = await loadLab();
run?.count("patrickreidbaldwin.com");

if (local) {
  const read = (n) => { try { return JSON.parse(readFileSync(`public/hockey/${n}.json`, "utf8")); } catch { return null; } };
  const docs = Object.fromEntries(NAMES.map((n) => [n, read(n)]));
  const block = { block: (docs.contracts?.block || []).filter((b) => b.auto) }, terms = docs.contracts ? publicTerms(docs.contracts) : null;
  const out = process.argv.includes("--public") ? await lab.headlessTradeMoves({ ...docs, contracts: null, teamCap: null, tradeBlock: block, contractTerms: terms }, {}) : await lab.headlessTradeMoves(docs, {});
  if (process.argv.includes("--write") && process.argv.includes("--public")) { // local preview files (public data only)
    writeFileSync("public/hockey/tradeMovesPublic.json", JSON.stringify(out)); writeFileSync("public/hockey/tradeBlock.json", JSON.stringify(block)); writeFileSync("public/hockey/contractTerms.json", JSON.stringify(terms)); }
  const n = Object.values(out.teams).reduce((a, l) => a + l.length, 0);
  console.log(`local run: ${Object.keys(out.teams).length} teams, ${n} deals, key ${out.key}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(0);
}

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const read = async (path) => { const s = await db.doc(path).get(); return s.exists ? JSON.parse(s.data().json) : null; };

const owner = (await db.doc("admin/owner").get()).data()?.uid;
const skip = (why) => { console.log(why); run.check(false, "inputs", why); run.finish({ ok: true, notes: { skipped: why } }); process.exit(0); };
if (!owner) skip("No owner id yet (it's recorded when the owner opens Hockey Lab signed in); skipped.");
const docs = Object.fromEntries(await Promise.all(NAMES.map(async (n) => [n, await read(`hockey/${n}`)])));
if (!docs.contracts || !docs.playerValue || !docs.league) skip("Missing contracts, player value or league data; skipped.");
const userEdits = {};
for (const name of ["contracts", "block", "meta"]) {
  const s = await db.collection(`apps/hockey/users/${owner}/${name}`).get();
  userEdits[name] = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
}
const out = await lab.headlessTradeMoves(docs, userEdits);
const json = JSON.stringify(out);
// Public versions for signed-out visitors (no contract or cap data, no owner edits): the news-only trade block, and the
// same search run as a visitor's page runs it (no contracts list, no cap table)
const tradeBlock = { builtAt: new Date().toISOString(), block: (docs.contracts.block || []).filter((b) => b.auto).map((b) => ({ id: b.id ?? null, name: b.name, team: b.team, status: b.status,
  since: b.since ?? null, firstSeen: b.firstSeen ?? null, lastSeen: b.lastSeen ?? null, reports: b.reports ?? null, sources: (b.sources || []).map((x) => ({ site: x.site, url: x.url, date: x.date, title: x.title, quote: x.quote })) })) };
await db.doc("hockey/tradeBlock").set({ json: JSON.stringify(tradeBlock), updatedAt: new Date().toISOString() });
// public contract terms: years, status, entry-level, signing date, extension years. No cap hits, sources or owner edits.
const contractTerms = publicTerms(docs.contracts);
await db.doc("hockey/contractTerms").set({ json: JSON.stringify(contractTerms), updatedAt: new Date().toISOString() });
const pub = await lab.headlessTradeMoves({ ...docs, contracts: null, teamCap: null, tradeBlock, contractTerms }, {});
const pubJson = JSON.stringify(pub);
if (Buffer.byteLength(pubJson) > 1_000_000) throw new Error("hockey/tradeMovesPublic is over Firestore's 1 MB limit");
await db.doc("hockey/tradeMovesPublic").set({ json: pubJson, updatedAt: new Date().toISOString() });
if (Buffer.byteLength(json) > 1_000_000) throw new Error("hockey/tradeMoves is over Firestore's 1 MB limit");
await db.doc("hockey/tradeMoves").set({ json, updatedAt: new Date().toISOString() });
const n = Object.values(out.teams).reduce((a, l) => a + l.length, 0), teams = Object.keys(out.teams).length;
run.check(teams === 32, "every team searched", `${teams} teams`);
run.finish({ outputs: ["hockey/tradeMoves", "hockey/tradeMovesPublic", "hockey/tradeBlock", "hockey/contractTerms"], notes: { teams, deals: n, kb: Math.round(json.length / 1024), key: out.key } });
console.log(`${teams} teams, ${n} deals stored (${(json.length / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);

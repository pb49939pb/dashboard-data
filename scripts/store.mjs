// Firestore storage for the nightly job (project pat-dashboard-eb494).
// Every document holds one JSON payload ({ json, updatedAt }) so any shape fits; the apps parse it.
// Writes never lose data: new values are merged over what's stored, so a source that fails one night,
// or a field that comes back empty, keeps its last good value. Rows (players, teams, games) that drop out
// of a new list are kept and marked _stale. Documents are only rewritten when something changed.
//
// Layout (rules in pat-dashboard/firestore.rules):
//   public/{doc}                 readable by anyone        (Red Wings widget)
//   hockey/{doc}                 signed-in users only      (Hockey Lab)
//   hockey/games/{season}/{id}   one document per game, with teams [home, away] for queries
//   hockey/history/{season}/{date} nightly projection snapshots
import { createHash } from "node:crypto";

let db = null;
// Every Firestore operation this process makes (2026-10-16: the owner tracks reads/writes and caps spend at $5/month).
// Run logs report it (runlog.mjs reads globalThis.__firestoreOps).
const ops = (globalThis.__firestoreOps ??= { reads: 0, writes: 0, deletes: 0 });
export const storeOps = () => ({ ...ops });
/** The quota day (Firestore's free daily quotas and our budget reset at midnight Pacific). */
export const quotaDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

/** Connect with the service account in FIREBASE_SERVICE_ACCOUNT (a GitHub secret). Returns null when it isn't set, or
    when the daily budget cutoff (admin/budget, set by scripts/budget.mjs) is in effect today, so every job that uses
    the store skips its Firestore work for the rest of the quota day. The budget job itself passes ignoreBudget. */
export async function openStore({ ignoreBudget = false } = {}) {
  if (process.env.STORE_DRY_RUN) { db = memoryDb(); return store; } // local check: same code, in memory
  const key = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!key) return null;
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(key)) });
  db = getFirestore();
  if (!ignoreBudget && (await budgetCutoff())) { console.log("Firestore budget cutoff is in effect today (admin/budget); skipping Firestore work"); return null; }
  return store;
}
/** Whether today's spend crossed the daily limit (one read). Other scripts that open Firestore themselves use it too. */
export async function budgetCutoff(database = db) {
  try { const s = await database.doc("admin/budget").get(); ops.reads++; const b = s.exists ? JSON.parse(s.data().json) : null; return !!(b?.tripped && b.day === quotaDay()); }
  catch { return false; } // can't tell: don't block the night's data on a failed read
}

const rowKey = (r) => (r && typeof r === "object" && !Array.isArray(r) ? r.id ?? r.team ?? r.abbrev ?? null : null);

// Lists that describe "right now" (upcoming games, the current wildcard race, the trade block): a fresh, non-empty list
// replaces the old one. The trade block (contracts.block) is rebuilt in full each night by block.py from the stored list,
// so a player it drops (traded, signed, request settled) must go; merged, he stayed on as a _stale row (B168, 2026-10-27).
const CURRENT = new Set(["nextGames", "wildcardRace", "divisionLeaders", "r1", "r2", "block"]);

/** Deep merge: `next` wins wherever it has a value; null/undefined never erase; keyed rows merge by id/team. */
export function merge(prev, next, key = "") {
  if (next === null || next === undefined) return prev;
  // This is an authoritative rolling window, not an accumulating season-long dictionary.
  if (key === "gameImpacts") return next;
  if (Array.isArray(next) && CURRENT.has(key)) return next.length || !Array.isArray(prev) ? next : prev;
  if (Array.isArray(next)) {
    const keyed = Array.isArray(prev) && next.length && next.every((r) => rowKey(r) !== null) && prev.every((r) => rowKey(r) !== null);
    if (!keyed) return next.length || !Array.isArray(prev) ? next : prev; // an empty list never wipes a full one
    const old = new Map(prev.map((r) => [String(rowKey(r)), r]));
    const out = next.map((r) => { const k = String(rowKey(r)); const m = merge(old.get(k), r); old.delete(k); delete m._stale; return m; });
    for (const r of old.values()) out.push({ ...r, _stale: true }); // not in tonight's data: keep it, flagged
    return out;
  }
  if (typeof next === "object" && prev && typeof prev === "object" && !Array.isArray(prev)) {
    const out = { ...prev };
    for (const [k, v] of Object.entries(next)) out[k] = merge(prev[k], v, k);
    return out;
  }
  return next;
}

const hash = (s) => createHash("sha1").update(s).digest("hex");
let writes = 0;

const store = {
  get writes() { return writes; },
  async read(path) {
    const snap = await db.doc(path).get(); ops.reads++;
    return snap.exists ? JSON.parse(snap.data().json) : null;
  },
  /** Every document in a collection, parsed. */
  async readAll(path) {
    const snap = await db.collection(path).get(); ops.reads += Math.max(1, snap.docs.length);
    return snap.docs.map((d) => JSON.parse(d.data().json));
  },
  /** Merge `data` into the document at `path` (extra plain fields, e.g. for queries, go in `fields`). `fix(merged)`
      may clean the merged document before it's written. */
  async put(path, data, fields = {}, { replace = false, fix = null } = {}) {
    const ref = db.doc(path);
    const snap = await ref.get(); ops.reads++;
    const prev = snap.exists ? JSON.parse(snap.data().json) : null;
    let merged = prev && !replace ? merge(prev, data) : data; // replace: offline models are full rebuilds from kept history
    if (fix) merged = fix(merged); // clear values the merge kept but that can't be right (merging never erases on its own)
    const json = JSON.stringify(merged);
    if (Buffer.byteLength(json) > 1_000_000) throw new Error(`${path} is over Firestore's 1 MB limit; split it`);
    const h = hash(json);
    if (snap.exists && snap.data().hash === h) return false;
    await ref.set({ json, hash: h, updatedAt: new Date().toISOString(), ...fields });
    writes++; ops.writes++;
    return true;
  },
  /** Write many small documents (games), skipping ones already stored unchanged. Never deletes. */
  /** Delete a collection and everything under it (one operation, e.g. CapWages data when the subscription ends). */
  async dropTree(path) {
    if (db.docs) { let n = 0; for (const k of [...db.docs.keys()]) if (k === path || k.startsWith(path + "/")) { db.docs.delete(k); n++; } return n; }
    const ref = db.collection(path); let n = 0;
    for (const d of (await ref.listDocuments())) { n++; await db.recursiveDelete(d); }
    ops.deletes += n;
    return n;
  },
  /** Many documents at once. With `index` (a document path), the hash of each document's incoming data is kept there, so
      one that comes in unchanged from last time is skipped without reading it (e.g. a season's games each night: one
      read instead of ~1,300). Documents that did change are read, merged and written as before. */
  async putMany(docs, { replace = false, index = null } = {}) {
    let idx = null, inHash = null;
    if (index) {
      const s = await db.doc(index).get(); ops.reads++;
      idx = s.exists ? JSON.parse(s.data().json) : { hashes: {} };
      inHash = docs.map((d) => hash(JSON.stringify([d.data, d.fields || {}, replace])));
      const keep = docs.map((d, i) => idx.hashes[d.path] !== inHash[i]);
      docs = docs.filter((_, i) => keep[i]); inHash = inHash.filter((_, i) => keep[i]);
    }
    const refs = docs.map((d) => db.doc(d.path));
    const existing = refs.length ? await db.getAll(...refs) : []; ops.reads += refs.length;
    let batch = db.batch(), n = 0, written = 0;
    for (let i = 0; i < docs.length; i++) {
      const prev = existing[i].exists ? JSON.parse(existing[i].data().json) : null;
      const merged = prev && !replace ? merge(prev, docs[i].data) : docs[i].data;
      const json = JSON.stringify(merged), h = hash(json);
      if (existing[i].exists && existing[i].data().hash === h) continue;
      batch.set(refs[i], { json, hash: h, updatedAt: new Date().toISOString(), ...(docs[i].fields || {}) });
      written++; writes++; ops.writes++;
      if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n) await batch.commit();
    if (index && docs.length) { // remember what came in, for tomorrow's skip
      docs.forEach((d, i) => { idx.hashes[d.path] = inHash[i]; });
      const json = JSON.stringify(idx);
      if (Buffer.byteLength(json) < 1_000_000) { await db.doc(index).set({ json, hash: hash(json), updatedAt: new Date().toISOString() }); ops.writes++; }
    }
    return written;
  },
};

/** Just enough of the Firestore Admin API, in memory, for STORE_DRY_RUN=1. */
function memoryDb() {
  const docs = new Map();
  const ref = (path) => ({ path, get: async () => snap(path), set: async (v) => { docs.set(path, v); } });
  const snap = (path) => ({ exists: docs.has(path), data: () => docs.get(path) });
  return {
    doc: ref,
    collection: (path) => ({ get: async () => ({ docs: [...docs].filter(([p]) => p.startsWith(path + "/") && !p.slice(path.length + 1).includes("/")).map(([, v]) => ({ data: () => v })) }) }),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    batch: () => { const ops = []; return { set: (r, v) => ops.push([r.path, v]), commit: async () => ops.forEach(([p, v]) => docs.set(p, v)) }; },
    docs,
  };
}

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

/** Connect with the service account in FIREBASE_SERVICE_ACCOUNT (a GitHub secret). Returns null when it isn't set. */
export async function openStore() {
  if (process.env.STORE_DRY_RUN) { db = memoryDb(); return store; } // local check: same code, in memory
  const key = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!key) return null;
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(key)) });
  db = getFirestore();
  return store;
}

const rowKey = (r) => (r && typeof r === "object" && !Array.isArray(r) ? r.id ?? r.team ?? r.abbrev ?? null : null);

// Lists that describe "right now" (upcoming games, the current wildcard race): a fresh, non-empty list replaces the old one
const CURRENT = new Set(["nextGames", "wildcardRace", "divisionLeaders", "r1", "r2"]);

/** Deep merge: `next` wins wherever it has a value; null/undefined never erase; keyed rows merge by id/team. */
export function merge(prev, next, key = "") {
  if (next === null || next === undefined) return prev;
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
    const snap = await db.doc(path).get();
    return snap.exists ? JSON.parse(snap.data().json) : null;
  },
  /** Every document in a collection, parsed. */
  async readAll(path) {
    const snap = await db.collection(path).get();
    return snap.docs.map((d) => JSON.parse(d.data().json));
  },
  /** Merge `data` into the document at `path` (extra plain fields, e.g. for queries, go in `fields`). `fix(merged)`
      may clean the merged document before it's written. */
  async put(path, data, fields = {}, { replace = false, fix = null } = {}) {
    const ref = db.doc(path);
    const snap = await ref.get();
    const prev = snap.exists ? JSON.parse(snap.data().json) : null;
    let merged = prev && !replace ? merge(prev, data) : data; // replace: offline models are full rebuilds from kept history
    if (fix) merged = fix(merged); // clear values the merge kept but that can't be right (merging never erases on its own)
    const json = JSON.stringify(merged);
    if (Buffer.byteLength(json) > 1_000_000) throw new Error(`${path} is over Firestore's 1 MB limit; split it`);
    const h = hash(json);
    if (snap.exists && snap.data().hash === h) return false;
    await ref.set({ json, hash: h, updatedAt: new Date().toISOString(), ...fields });
    writes++;
    return true;
  },
  /** Write many small documents (games), skipping ones already stored unchanged. Never deletes. */
  async putMany(docs) {
    const refs = docs.map((d) => db.doc(d.path));
    const existing = refs.length ? await db.getAll(...refs) : [];
    let batch = db.batch(), n = 0, written = 0;
    for (let i = 0; i < docs.length; i++) {
      const prev = existing[i].exists ? JSON.parse(existing[i].data().json) : null;
      const merged = prev ? merge(prev, docs[i].data) : docs[i].data;
      const json = JSON.stringify(merged), h = hash(json);
      if (existing[i].exists && existing[i].data().hash === h) continue;
      batch.set(refs[i], { json, hash: h, updatedAt: new Date().toISOString(), ...(docs[i].fields || {}) });
      written++; writes++;
      if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n) await batch.commit();
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

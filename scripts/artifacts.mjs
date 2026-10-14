// Versioned model artifacts (audit: reproducible, authoritative values; principle 3, "new fields must have an explicit
// model version and as_of date"). Every night, for each model output the site reads:
//   hash      sha256 of the published JSON (first 16 hex): the artifact's identity
//   version / builtAt / asOf, and the code commit that produced the night's build (GITHUB_SHA)
// written to public/hockey/artifacts.json (published as hockey/artifacts), plus a write-once copy of each artifact
// version at hockey/artifactVersions/versions/{name}_{hash} the first time that hash is seen. The site stamps every trade
// valuation with the hashes it used, so any number it shows can be recomputed from the exact inputs.
//   node scripts/artifacts.mjs     (FIREBASE_SERVICE_ACCOUNT for the versioned copies; without it, the manifest only)
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { openStore } from "./store.mjs";

const NAMES = ["playerValue", "playerProjections", "tradePricing", "scorecards", "projections", "injuries", "assets"];
const commit = process.env.GITHUB_SHA || (() => { try { return execSync("git rev-parse HEAD").toString().trim(); } catch { return null; } })();
const store = await openStore().catch(() => null);
const prev = await readFile("public/hockey/artifacts.json", "utf8").then(JSON.parse, () => null);
const out = { builtAt: new Date().toISOString(), commit, artifacts: {} };
let stored = 0;
for (const name of NAMES) {
  const text = await readFile(`public/hockey/${name}.json`, "utf8").catch(() => null);
  if (!text) continue;
  const d = JSON.parse(text), hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const path = `hockey/artifactVersions/versions/${name}_${hash}`;
  const seen = prev?.artifacts?.[name]?.hash === hash ? prev.artifacts[name] : null;
  out.artifacts[name] = { hash, bytes: text.length, model: d.model || null, version: d.version || null, builtAt: d.builtAt || d.updatedAt || null,
    asOf: d.throughDate || d.through || d.season || null, firstPublishedAt: seen?.firstPublishedAt || out.builtAt, commit: seen?.commit || commit, path };
  if (store && text.length < 900000 && !(await store.read(path).catch(() => null))) { await store.put(path, d, { name, hash }, { replace: true }); stored++; }
}
await writeFile("public/hockey/artifacts.json", JSON.stringify(out));
console.log(`artifacts: ${Object.keys(out.artifacts).length} in the manifest, ${stored} new versions stored${store ? "" : " (no Firestore credentials: manifest only)"}`);

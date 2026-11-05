// Local, owner-only: copy the last CapWages import (capwages/raw/teams, the licensed player payloads) to a file for
// hockey-models' question-of-the-day tax answer (hockey/qotd_tax.py reads hockey-models/data/raw/capwages/teams.json,
// which git ignores). Prints counts only (this repo is public). Delete the copy if the subscription ends (14 days).
//   GOOGLE_APPLICATION_CREDENTIALS=<your ADC file> node scripts/capwagesExport.mjs ../hockey-models/data/raw/capwages/teams.json
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const out = process.argv[2];
if (!out) { console.error("usage: node scripts/capwagesExport.mjs <output file>"); process.exit(2); }
initializeApp({ credential: applicationDefault(), projectId: "pat-dashboard-eb494" });
const snap = await getFirestore().collection("capwages/raw/teams").get(); // 32 reads
const docs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(docs));
await chmod(out, 0o600);
console.log(`${snap.size} team documents written`);

// "Run now" from the admin panel: picks up requests in Firestore admin/requests/pending/{job} and starts the matching
// GitHub workflow. Runs every 10 minutes (dispatch.yml). Jobs in this repo use the workflow's own token;
// the monthly models live in the private hockey-models repo and need JOBS_TOKEN (a token you create).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const TARGETS = {
  "nightly-build": { repo: "pb49939pb/dashboard-data", workflow: "update.yml", token: "GITHUB_TOKEN" },
  "contracts-news": { repo: "pb49939pb/dashboard-data", workflow: "update.yml", token: "GITHUB_TOKEN" },
  contracts: { repo: "pb49939pb/dashboard-data", workflow: "contracts.yml", token: "GITHUB_TOKEN" },
  "trade-moves": { repo: "pb49939pb/dashboard-data", workflow: "trades.yml", token: "GITHUB_TOKEN" },
  models: { repo: "pb49939pb/hockey-models", workflow: "monthly.yml", token: "JOBS_TOKEN" },
};
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const pending = (await db.collection("admin/requests/pending").get()).docs.filter((d) => !d.data().dispatchedAt);
for (const d of pending) {
  const t = TARGETS[d.id];
  const token = t && process.env[t.token];
  if (!t || !token) { await d.ref.set({ dispatchedAt: Date.now(), result: t ? `missing ${t.token}` : "unknown job" }, { merge: true }); continue; }
  const r = await fetch(`https://api.github.com/repos/${t.repo}/actions/workflows/${t.workflow}/dispatches`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "dashboard-data-dispatch" },
    body: JSON.stringify({ ref: "main" }),
  });
  await d.ref.set({ dispatchedAt: Date.now(), result: r.ok ? "started" : `GitHub said ${r.status}: ${(await r.text()).slice(0, 200)}` }, { merge: true });
  console.log(d.id, r.status);
}
console.log(`${pending.length} request(s)`);

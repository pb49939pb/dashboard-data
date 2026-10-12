// Run logs for the admin panel: each job records when it ran, how long it took, whether it worked, and how many
// requests it made to each source (network vs cache). Written to public/admin/run-{job}.json and published to
// Firestore admin/jobs by publish.mjs (readable only by the site owner, per firestore.rules).
import { mkdirSync, writeFileSync } from "node:fs";

export function startRun(job, meta = {}) {
  const startedAt = new Date();
  const sources = {};
  const health = []; // completeness checks: { ok, what, detail }
  const run = {
    job,
    /** Count one request to `source` (a host or short name). */
    count(source, { cached = false, ok = true } = {}) {
      const s = (sources[source] ??= { requests: 0, cached: 0, failed: 0, retried: 0, recovered: 0, gaveUp: 0 });
      if (cached) s.cached++; else s.requests++;
      if (!ok) s.failed++;
    },
    /** A request that needed more than one try: recovered (worked on a retry) or gave up. */
    retry(source, recovered) {
      const s = (sources[source] ??= { requests: 0, cached: 0, failed: 0, retried: 0, recovered: 0, gaveUp: 0 });
      s.retried++; if (recovered) s.recovered++; else s.gaveUp++;
    },
    /** Record a completeness check: ok=false means something downstream is running on partial data. */
    check(ok, what, detail = "") { health.push({ ok: !!ok, what, detail }); },
    finish({ ok = true, error = null, outputs = [], notes = {} } = {}) {
      const finishedAt = new Date();
      const log = {
        job, ok, error: error ? String(error.stack || error).slice(0, 2000) : null,
        startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), seconds: Math.round((finishedAt - startedAt) / 100) / 10,
        sources, outputs, notes, health, ...meta,
        github: process.env.GITHUB_RUN_ID ? { run: process.env.GITHUB_RUN_ID, url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, workflow: process.env.GITHUB_WORKFLOW, event: process.env.GITHUB_EVENT_NAME } : { local: true },
      };
      mkdirSync("public/admin", { recursive: true });
      writeFileSync(`public/admin/run-${job}.json`, JSON.stringify(log));
      return log;
    },
  };
  // A crash still leaves a log (published by the workflow's failure step)
  const crash = (e) => { run.finish({ ok: false, error: e }); console.error(e); process.exit(1); };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  return run;
}

/** host name of a URL, for counting */
export const hostOf = (url) => { try { return new URL(url).host; } catch { return "other"; } };

// The Other Score rebrand, Phase 0: a repeatable signed-out baseline of Hockey Lab's public pages.
// Drives the locally installed Google Chrome over the DevTools protocol (no new dependencies): for each page and width it
// saves a full-page screenshot, and for the mobile profile it records load metrics under a cellular-like throttle.
//
//   node docs/brand/tools/baseline.mjs [baseUrl] [outDir] [tabs]
//     baseUrl  default https://patrickreidbaldwin.com/hockey/
//     outDir   default docs/brand/baseline/<YYYY-MM-DD>
//
// Profile ("cellular"): 1.6 Mbps down / 750 kbps up / 150 ms RTT, CPU slowed 4x, 390x844 at DPR 3, touch, cold cache,
// 3 runs per page (median reported). readyMs = when the tab's main content is in the page (since 2026-10-19 the same
// test for every tab: #view has 800+ characters of text and no loading skeleton) (Teams: the team header;
// Goalies, Overview, Skaters: a filled table), added 2026-10-16 because LCP can be the header's loading text instead.
// These are lab measurements on this Mac, not field data; compare runs only with
// the same machine and profile. Owner and tester views need a signed-in browser and are captured by hand (see README).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "https://patrickreidbaldwin.com/hockey/";
const OUT = process.argv[3] || `docs/brand/baseline/${new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })}`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGES = process.argv[4] ? process.argv[4].split(",") : ["overview", "teams", "skaters", "goalies", "coaches", "shots", "office", "model"]; // optional 3rd arg: comma-separated tabs
const WIDTHS = [320, 360, 390, 430, 1280];
const RUNS = 3;
mkdirSync(OUT, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "tos-baseline-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 50 && !ver; i++) { await sleep(200); ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null); }
if (!ver) { chrome.kill(); throw new Error("Chrome didn't start"); }

async function session() {
  const t = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const wait = new Map(), events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method) events.push(d); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, events, close: async () => { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {}); } };
}
async function settle(s, ms = 6000) { // wait for the network to go quiet (or a cap)
  const start = Date.now(); let lastCount = -1, quietSince = Date.now();
  while (Date.now() - start < ms * 4) {
    const n = s.events.filter((e) => e.method === "Network.loadingFinished").length;
    if (n !== lastCount) { lastCount = n; quietSince = Date.now(); }
    if (Date.now() - quietSince > 1500 && Date.now() - start > 1500) break;
    await sleep(250);
  }
}

const metrics = [];
for (const page of PAGES) {
  // load metrics, mobile + cellular, cold cache, median of RUNS
  const runs = [];
  for (let r = 0; r < RUNS; r++) {
    const s = await session();
    await s.send("Network.enable"); await s.send("Page.enable"); await s.send("Network.clearBrowserCache");
    await s.send("Network.setCacheDisabled", { cacheDisabled: true });
    await s.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await s.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await s.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await s.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await s.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__lcp=0;window.__cls=0;window.__ready=0;new MutationObserver(()=>{const v=document.querySelector("#view");if(!window.__ready&&v&&!v.querySelector(".skeleton")&&v.innerText.length>800)window.__ready=performance.now()}).observe(document,{subtree:true,childList:true});new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:"largest-contentful-paint",buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:"layout-shift",buffered:true});` });
    const t0 = Date.now();
    await s.send("Page.navigate", { url: `${BASE}#${page}` });
    await settle(s);
    // 2026-10-19: the tab is ready when #view has real content and no loading skeletons (same test for every tab);
    // wait for it (up to 40 s), since a quiet network can come before the throttled CPU has finished the script
    for (let i = 0; i < 160; i++) { const r = (await s.send("Runtime.evaluate", { expression: "window.__ready", returnByValue: true })).result?.result?.value; if (r) break; await sleep(250); }
    await settle(s, 2000);
    const ev = (await s.send("Runtime.evaluate", { expression: `JSON.stringify({lcp:window.__lcp,cls:window.__cls,dcl:performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd,cards:document.querySelectorAll(".card").length,ready:window.__ready})`, returnByValue: true })).result?.result?.value;
    const m = JSON.parse(ev || "{}");
    const done = s.events.filter((e) => e.method === "Network.loadingFinished");
    m.requests = done.length; m.kb = Math.round(done.reduce((a, e) => a + (e.params.encodedDataLength || 0), 0) / 1024); m.settledMs = Date.now() - t0;
    runs.push(m);
    await s.close();
  }
  const med = (k) => { const v = runs.map((x) => x[k] ?? 0).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  metrics.push({ page, readyMs: Math.round(med("ready")), lcpMs: Math.round(med("lcp")), cls: +med("cls").toFixed(3), dclMs: Math.round(med("dcl")), requests: med("requests"), transferKB: med("kb"), cards: med("cards"), runs: RUNS });
  // screenshots at each width (unthrottled, warm)
  const s = await session();
  await s.send("Page.enable"); await s.send("Network.enable");
  for (const w of WIDTHS) {
    await s.send("Emulation.setDeviceMetricsOverride", { width: w, height: w < 800 ? 844 : 900, deviceScaleFactor: w < 800 ? 2 : 1, mobile: w < 800 });
    await s.send("Page.navigate", { url: `${BASE}?w=${w}#${page}` }); // a real reload per width (a hash change alone keeps the old layout)
    await settle(s, 4000);
    const shot = await s.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    if (shot.result?.data) writeFileSync(`${OUT}/${page}-${w}.png`, Buffer.from(shot.result.data, "base64"));
  }
  await s.close();
  console.log(page, JSON.stringify(metrics.at(-1)));
}
writeFileSync(`${OUT}/metrics.json`, JSON.stringify({ base: BASE, takenAt: new Date().toISOString(), profile: "390x844 DPR3 mobile, 1.6Mbps/750kbps/150ms, CPU 4x, cold cache, median of 3", pages: metrics }, null, 1));
chrome.kill();

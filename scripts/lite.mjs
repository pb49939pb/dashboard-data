// Slim companions of the two largest documents, for the site's first paint on phones (perf step 2, owner-approved
// 2026-10-16; docs/perf/first-load-proposal.md). Built from the full documents right before publishing, and published
// next to them; the full documents stay for everything that needs every field.
//   node scripts/lite.mjs   public/hockey/players.json  → public/hockey/playersLite.json
//                           public/hockey/injuries.json → public/hockey/injuriesLite.json
// playersLite: what the Teams and Goalies tabs, ratings and player types read (id, name, team, position, minutes,
// ratings and the per-60 rates the Teams cards read), numbers rounded to 3 decimals; no nested season or competition blocks. Player cards and the Skaters
// table load the full document when opened.
// injuriesLite: this season only (the card's "last season" view loads the full document), without the roster lists
// the server-side season simulation uses.
import { readFile, writeFile } from "node:fs/promises";

const load = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const r3 = (v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
// read by: ratings and best players (ratings, minutes, pos), player types (ixg60, pa60, hits60, blk60, tk60, pkGp), the trade
// explorer's production line (toiGp, sa60), and style fits on Teams (relA, relF, dzs, gv60, dzgv60, hdShare, ua60)
export const PLAYER_FIELDS = ["id", "name", "team", "pos", "minutes", "ratings", "ixg60", "pa60", "sa60", "toiGp", "pkGp", "hits60", "blk60", "tk60",
  "relA", "relF", "dzs", "gv60", "dzgv60", "hdShare", "ua60"];

export const playersLite = (P) => ({ updatedAt: P.updatedAt, season: P.season, blendedWith: P.blendedWith ?? null, source: P.source, lite: true,
  players: P.players.map((p) => Object.fromEntries(PLAYER_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, r3(p[k])]))) });
export const injuriesLite = (I) => {
  const { rosters, injuredReserve, ...current } = I.current || {};
  return { builtAt: I.builtAt, season: I.season, method: I.method, lite: true, current };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = [];
  const P = await load("public/hockey/players.json");
  if (P?.players?.length) { await writeFile("public/hockey/playersLite.json", JSON.stringify(playersLite(P))); out.push("playersLite"); }
  const I = await load("public/hockey/injuries.json");
  if (I?.current) { await writeFile("public/hockey/injuriesLite.json", JSON.stringify(injuriesLite(I))); out.push("injuriesLite"); }
  console.log(`slim documents written: ${out.join(", ") || "none (inputs missing)"}`);
}

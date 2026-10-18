"""Trade block from hockey news: players who've requested a trade or that insiders report are in trade talks.

Reads RSS feeds that allow it (ProHockeyRumors league and team feeds, NHL Trade Rumors, which quotes the insiders'
posts on X and TV, and Daily Faceoff), finds sentences that tie a trade request or trade talks to a named player, and
keeps a running list in public/hockey/contracts.json ("block"). Entries you added by hand are never touched. An entry
drops off when it goes quiet (60 days; 120 for a trade request), when a newer report says he's staying, or when he's
traded (his team changes).

    python scripts/block.py
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import contracts as C  # noqa: E402  (fetching, caching, run logs and the feed parser are shared)

C.DELAY.update({"www.nhltraderumors.me": 3.0, "www.dailyfaceoff.com": 3.0})
SLUG = {t: re.sub(r"[^a-z0-9]+", "-", n.lower().replace(".", "")).strip("-") for t, n in C.PAGES.items()}
FEEDS = [("NHL Trade Rumors", "https://www.nhltraderumors.me/feeds/posts/default?alt=rss&max-results=100"),
         ("Daily Faceoff", "https://www.dailyfaceoff.com/feed"),
         ("ProHockeyRumors", "https://www.prohockeyrumors.com/feed")] + \
        [("ProHockeyRumors", f"https://www.prohockeyrumors.com/category/{s}/feed") for s in SLUG.values()]

REQUEST = re.compile(r"request(?:ed|s|ing)? (?:a |to be )?trade|trade request|asked (?:for a trade|to be traded|out)|wants out\b|wants to be traded|"
                     r"demand(?:ed|s)? a trade|desire to move on|holdout", re.I)
TALKS = re.compile(r"trade block|on the block|being shopped|shopping (?:him|the)|listening (?:to|on) offers|fielding (?:calls|offers|interest)|field offers|"
                   r"open to (?:moving|trading|dealing)|exploring (?:a |the )?trade|gauging (?:the )?(?:trade )?(?:market|interest)|made available|"
                   r"is available(?! to the media)|available (?:in|via|for) (?:a )?trade|could be moved|likely to be moved|expected to be moved|trade candidate|"
                   r"trade chip|trade talks|advanced talks|trade discussions|trade conversations|has been floated|on the (?:trade )?market", re.I)
STAYING = re.compile(r"not (?:available|on the block|being shopped|looking to trade|interested in trading)|no (?:plans|intention) to (?:trade|move)|"
                     r"untouchable|off the table|won'?t be traded|(?:is|isn'?t) going nowhere|not going anywhere|rescind|withdr[ae]w (?:his|the) (?:trade )?request|"
                     r"signed an? (?:[\w-]+ )?extension|agreed to an? (?:[\w-]+ )?extension", re.I)
TRADED = re.compile(r"\b(?:was|has been|had been|got) traded\b|\b(?:have|has|had) (?:officially )?(?:acquired|traded)\b|\bacquired (?!.{0,15}\bif\b)|"
                    r"complete[sd]? (?:a |the )?(?:[\w-]+ )?trade|(?<!be )(?<!to be )\btraded to\b", re.I)
SPECULATIVE = re.compile(r"\b(?:mock|proposed|poll|hot take|could land|ideal|dream|fantasy|what if|should the|predict)", re.I)  # titles: ideas, not reports
INSIDERS = re.compile(r"Friedman|LeBrun|Seravalli|Dreger|McKenzie|Pagnotta|Kypreos|Johnston|Shannon|Murphy|Garrioch|Marek")
CUE_REACH = 90  # a cue belongs to the nearest player named within this many characters

# The Inside Scoop (2026-10-18): who reported it and where, which teams each report names, and the player's reported
# trade list (teams on it, teams ruled out, its size), each fact with its quote, date and link so it can be checked.
INSIDER_NAMES = {"Friedman": "Elliotte Friedman", "LeBrun": "Pierre LeBrun", "Seravalli": "Frank Seravalli", "Dreger": "Darren Dreger",
                 "McKenzie": "Bob McKenzie", "Pagnotta": "David Pagnotta", "Kypreos": "Nick Kypreos", "Johnston": "Chris Johnston",
                 "Marek": "Jeff Marek", "Garrioch": "Bruce Garrioch", "Weekes": "Kevin Weekes", "Russo": "Michael Russo", "Kaplan": "Emily Kaplan",
                 "Lavoie": "Renaud Lavoie", "Shannon": "Brian Shannon", "Murphy": "Ryan Murphy", "Wyshynski": "Greg Wyshynski"}
INSIDER_RX = re.compile(r"\b(" + "|".join(INSIDER_NAMES) + r")\b")
VIA = [("X", re.compile(r"\(@\w+\)|\bon X\b|\btweet|\bposted\b|\bX post", re.I)), ("TSN", re.compile(r"\bTSN\b|Insider Trading", re.I)),
       ("Sportsnet", re.compile(r"Sportsnet|32 Thoughts|Saturday Headlines|Hockey Night|Saturday Night Hockey", re.I)), ("The Athletic", re.compile(r"The Athletic", re.I)),
       ("podcast", re.compile(r"podcast|The Sheet|Hello Hockey|Spittin", re.I)), ("radio", re.compile(r"\bradio\b|The Fan\b|\bFAN 590\b|TSN 690", re.I)),
       ("Daily Faceoff", re.compile(r"Daily Faceoff", re.I))]
NICK = {"ANA": "Ducks", "BOS": "Bruins", "BUF": "Sabres", "CGY": "Flames", "CAR": "Hurricanes|Canes", "CHI": "Blackhawks", "COL": "Avalanche|Avs",
        "CBJ": "Blue Jackets", "DAL": "Stars", "DET": "Red Wings", "EDM": "Oilers", "FLA": "Panthers", "LAK": "Kings", "MIN": "Wild", "MTL": "Canadiens|Habs",
        "NSH": "Predators|Preds", "NJD": "Devils", "NYI": "Islanders|Isles", "NYR": "Rangers", "OTT": "Senators|Sens", "PHI": "Flyers", "PIT": "Penguins|Pens",
        "SJS": "Sharks", "SEA": "Kraken", "STL": "Blues", "TBL": "Lightning|Bolts", "TOR": "Maple Leafs|Leafs", "VAN": "Canucks", "VGK": "Golden Knights",
        "WSH": "Capitals|Caps", "WPG": "Jets", "UTA": "Mammoth"}
CITY = {"ANA": "Anaheim", "BOS": "Boston", "BUF": "Buffalo", "CGY": "Calgary", "CAR": "Carolina", "CHI": "Chicago", "COL": "Colorado", "CBJ": "Columbus",
        "DAL": "Dallas", "DET": "Detroit", "EDM": "Edmonton", "FLA": "Florida", "LAK": "Los Angeles|L\\.A\\.", "MIN": "Minnesota", "MTL": "Montreal|Montréal",
        "NSH": "Nashville", "NJD": "New Jersey", "OTT": "Ottawa", "PHI": "Philadelphia|Philly", "PIT": "Pittsburgh", "SJS": "San Jose", "SEA": "Seattle",
        "STL": "St\\. Louis", "TBL": "Tampa Bay|Tampa", "TOR": "Toronto", "VAN": "Vancouver", "VGK": "Vegas", "WSH": "Washington", "WPG": "Winnipeg", "UTA": "Utah"}
TEAM_RX = {t: re.compile(r"\b(?:" + "|".join(x for x in (NICK.get(t), CITY.get(t)) if x) + r")\b") for t in C.PAGES}
CANADA = ["CGY", "EDM", "MTL", "OTT", "TOR", "VAN", "WPG"]
LIST_CUE = re.compile(r"\b(?:(?:his|the|a|[A-Z][a-z]+'s) (?:initial |original |current |approved |limited |short )*(?:trade |wish |approved )?list|list of (?:approved |acceptable )?teams|approved teams|no-trade|NTC|waive)\b", re.I)
HYPO = re.compile(r"\bif\b|\bunless\b|\bshould\b|\bwould (?:have|need)|\bcould\b", re.I)
CONTRAST = re.compile(r"\b(?:however|but|while|although|though|whereas)\b", re.I)
INTEREST = re.compile(r"interest(?:ed)?\b|in contact|going hard|pursu(?:e|ing)|circling|kick(?:ed|ing) (?:the )?tires|inquir(?:ed|ing|ies)|called (?:about|on)|"
                      r"pounce|serious about|\btarget(?:ing|s)?\b|in the mix|front-?runner|frontrunner|in on (?:him|Larkin|the)|talks with|discuss(?:ed|ing)? (?:a |the )?(?:trade|deal)|"
                      r"\bin talks\b|sweepstakes|suitor", re.I)
OFF_CUE = re.compile(r"\bnot on\b|isn'?t on|aren'?t on|\bnor\b|does(?: not|n'?t) include|(?:hasn'?t|has not|haven'?t|have not) (?:yet )?(?:opened|expanded|added)|off (?:the|his) list|"
                     r"not (?:one of|included|among)|ruled out|excluded|no Canadian|not .{0,30}\bon (?:his|the) list|still off", re.I)
ON_CUE = re.compile(r"list (?:was|is|includes|included|features|consists of)|on (?:his|the) (?:approved |trade |wish )?list|approved (?:list|teams)? ?(?:includes|of)|"
                    r"willing to (?:waive|go) (?:for|to)|would waive (?:for|to)", re.I)
SIZE = re.compile(r"\b(?:up to |around |about |roughly )?(\d{1,2}|eight|ten|twelve|fifteen)(?:\s*(?:to|-|or)\s*(\d{1,2}))?\s+teams\b", re.I)
WORDS = {"eight": "8", "ten": "10", "twelve": "12", "fifteen": "15"}


def teams_in(text: str, own: str | None = None) -> list[str]:
    return [t for t, rx in TEAM_RX.items() if t != own and rx.search(text)]


def credit(sent: str, around: str) -> tuple[str | None, str | None]:
    """(insider's full name, platform) for a report sentence, from the sentence or the text right around it."""
    m = INSIDER_RX.search(sent) or INSIDER_RX.search(around)
    via = next((v for v, rx in VIA if rx.search(sent) or rx.search(around)), None)
    return (INSIDER_NAMES[m.group(1)] if m else None), via


def list_facts(sent: str, p: dict, it: dict) -> list[dict]:
    """Trade-list facts in one sentence about player p: on / off (teams) and size."""
    if not LIST_CUE.search(sent):
        return []
    own, out = p.get("team"), []
    base = {"date": it["date"], "url": it["url"], "site": it["site"], "quote": " ".join(sent.split())[:260]}
    off = bool(OFF_CUE.search(sent))
    if off:
        ts = teams_in(sent, own)
        if re.search(r"Canad(?:a|ian)", sent):
            ts = sorted(set(ts) | set(CANADA))
        out += [{**base, "kind": "off", "team": t} for t in ts]
    elif ON_CUE.search(sent) and not HYPO.search(sent):
        head = CONTRAST.split(sent, maxsplit=1)[0]  # "his list was A, B and C, however D and E have called": only A, B, C
        out += [{**base, "kind": "on", "team": t} for t in teams_in(head, own)]
    m = SIZE.search(sent)
    if m and re.search(r"list|teams? (?:he'?d|he would)|willing", sent, re.I):
        a = WORDS.get(m.group(1).lower(), m.group(1)); b = WORDS.get((m.group(2) or "").lower(), m.group(2))
        out.append({**base, "kind": "size", "size": f"{a}–{b}" if b else a})
    return out


def candidates() -> dict:
    """norm(name) -> player, from current NHL rosters plus last season's players (unsigned RFAs, holdouts)."""
    out = {}
    try:
        for p in json.loads((C.ROOT / "public" / "hockey" / "players.json").read_text())["players"]:
            out[C.norm(p["name"])] = {"id": p["id"], "name": p["name"], "team": p["team"], "rostered": False}
    except (OSError, KeyError, ValueError):
        pass
    for t in sorted(C.PAGES):
        r = C.nhl(f"roster/{t}/current") or {}
        for grp in ("forwards", "defensemen", "goalies"):
            for p in r.get(grp, []):
                n = f"{p['firstName']['default']} {p['lastName']['default']}"
                out[C.norm(n)] = {"id": p["id"], "name": n, "team": t, "rostered": True}
    return out


def mentions(text: str, by_name: dict, known_last: dict) -> list[tuple[int, dict]]:
    """(position, player) for every full name in the text, and last names of players already named in this item."""
    hits = []
    for m in C.NAME.finditer(text):
        p = by_name.get(C.norm(re.sub(r"[’']s$", "", m.group(0))))
        if p:
            hits.append((m.start(), p)); known_last[p["name"].split()[-1]] = p
    for last, p in known_last.items():
        for m in re.finditer(r"\b" + re.escape(last) + r"\b", text):
            if not any(q is p and h <= m.start() < h + len(p["name"]) + 1 for h, q in hits):
                hits.append((m.start(), p))
    return hits


def snippet(sent: str, pos: int, width: int = 240) -> str:
    """The part of a long sentence around the cue."""
    a = max(0, pos - width // 2)
    b = min(len(sent), a + width)
    out = " ".join(sent[a:b].split())
    return ("…" if a else "") + out + ("…" if b < len(sent) else "")


def scan(items: list[dict], by_name: dict) -> list[dict]:
    """One signal per (player, item, kind): kind is request / talks / staying / traded."""
    out = []
    for it in items:
        known: dict = {}
        sents = [it["title"]] + re.split(r"(?<=[.!?])\s+(?=[A-Z\"“])|\s+[—–]\s+|\s*https?://\S+\s*|\s#\w+", it["text"])
        spec = bool(SPECULATIVE.search(it["title"]))
        seen = set()
        # sentences; aggregator posts string quoted tweets together, so links, hashtags and " — " end a sentence too
        focus = [p for p in by_name.values() if p["name"] in it["title"]]  # the player an item is about, for "his list" sentences
        for si, sent in enumerate(sents):
            if not sent or len(sent) < 12:
                continue
            ms = mentions(sent, by_name, known)
            around = " ".join(sents[max(0, si - 1): si + 2])
            # trade-list facts: the player named in the sentence, else the one the item is about
            about = list({h[1]["id"]: h[1] for h in ms}.values()) if ms else focus[:1] if re.search(r"\b(?:his|he)\b", sent, re.I) else []
            for p in about:
                for f in list_facts(sent, p, it):
                    out.append({"player": p, "kind": "list", "fact": f})
            # teams reported interested in him (linked teams), from sentences about him that name a team and an interest cue
            if len(about) == 1 and INTEREST.search(sent) and not SPECULATIVE.search(it["title"]):
                for t in teams_in(sent, about[0].get("team")):
                    out.append({"player": about[0], "kind": "link", "team": t, "date": it["date"], "url": it["url"]})
            if not ms:
                continue
            for kind, rx in (("request", REQUEST), ("talks", TALKS), ("staying", STAYING), ("traded", TRADED)):
                if kind == "talks" and spec:
                    continue
                for cue in rx.finditer(sent):
                    pos = cue.start()
                    best = min(ms, key=lambda h: abs(h[0] - pos))
                    if abs(best[0] - pos) > CUE_REACH or (best[1]["id"], kind) in seen:
                        continue
                    seen.add((best[1]["id"], kind))
                    who, via = credit(sent, around)
                    out.append({"player": best[1], "kind": kind, "site": it["site"], "url": it["url"], "date": it["date"], "title": it["title"],
                                "quote": snippet(sent, pos), "insider": bool(INSIDERS.search(sent)), "by": who, "via": via,
                                "teams": teams_in(sent, best[1].get("team"))})
    return out


def build(prev_block: list[dict], signals: list[dict], by_name: dict, today: date) -> list[dict]:
    # entries without "auto" were prefilled by hand when the list started; news about the same player replaces them.
    # (Your own edits on the site live in your account and always win over this list.)
    manual = [b for b in prev_block if not b.get("auto")]
    old = {b["id"]: b for b in prev_block if b.get("auto") and b.get("id")}
    by_id: dict[int, dict] = {}
    facts: dict[int, list] = {}
    links: dict[int, dict] = {}
    for s in signals:
        if s["kind"] == "list":
            facts.setdefault(s["player"]["id"], []).append(s["fact"]); continue
        if s["kind"] == "link":
            links.setdefault(s["player"]["id"], {}).setdefault(s["team"], set()).add((s["url"], s["date"])); continue
        by_id.setdefault(s["player"]["id"], []).append(s)
    team_of = {p["id"]: p for p in by_name.values()}
    out = []
    for pid in set(by_id) | set(old):
        sig, was = by_id.get(pid, []), old.get(pid)
        srcs = {(x["url"], x["kind"]): x for x in (was or {}).get("sources", [])}
        for x in sig:
            srcs[(x["url"], x["kind"])] = {k: x.get(k) for k in ("kind", "site", "url", "date", "title", "quote", "insider", "by", "via", "teams")}
        allsrc = sorted(srcs.values(), key=lambda x: x["date"], reverse=True)
        pos = [x for x in allsrc if x["kind"] in ("request", "talks")]
        if not pos:
            continue
        last_pos = pos[0]["date"]
        if any(x["date"] > last_pos for x in allsrc if x["kind"] in ("staying", "traded")):
            continue  # a newer report says he's staying, or he's been moved
        request = any(x["kind"] == "request" for x in pos)
        talks = [x for x in pos if x["kind"] == "talks"]
        if not request and not (len({x["url"] for x in talks}) >= 2 or any(x["insider"] for x in talks)):
            continue  # one passing mention of trade talk isn't enough
        if date.fromisoformat(last_pos) < today - timedelta(days=120 if request else 60):
            continue
        p = team_of.get(pid) or (sig[0]["player"] if sig else {"id": pid, "name": was["name"], "team": was["team"], "rostered": True})
        if was and was.get("team") and p.get("rostered") and p["team"] != was["team"]:
            continue  # traded since the first report
        first = min(x["date"] for x in pos)
        lead = next(x for x in pos if x["kind"] == ("request" if request else "talks"))
        # trade list: this run's facts merged with what earlier runs found (one per team; the newest report wins)
        tl = {}
        for f in ((was or {}).get("tradeList") or {}).get("facts", []) + facts.get(pid, []):
            k = f["team"] if f["kind"] in ("on", "off") else "size"
            if k not in tl or f["date"] >= tl[k]["date"]:
                tl[k] = f
        linked = {e["team"]: {**e, "urls": set(e.get("urls") or [])} for e in (was or {}).get("linked") or []}
        hits = {t: set(v) for t, v in links.get(pid, {}).items()}
        for x in pos:
            for t in x.get("teams") or []:
                hits.setdefault(t, set()).add((x["url"], x["date"]))
        for t, v in hits.items():
            if t == p["team"]:
                continue
            e = linked.setdefault(t, {"team": t, "urls": set(), "last": ""})
            for u, d in v:
                e["urls"].add(u); e["last"] = max(e["last"], d)
        for e in linked.values():
            e["n"] = len(e["urls"]); e["urls"] = sorted(e["urls"])[:6]
        out.append({"id": pid, "name": p["name"], "team": p["team"], "auto": True, "status": "requested trade" if request else "in trade talks",
                    "since": first[:7], "firstSeen": first, "lastSeen": last_pos, "reports": len({x["url"] for x in pos}),
                    "note": lead["quote"], "src": lead["url"], "sources": [x for x in allsrc if x["kind"] in ("request", "talks")][:40],
                    "tradeList": {"facts": sorted(tl.values(), key=lambda f: f["date"], reverse=True)} if tl else None,
                    "linked": sorted(linked.values(), key=lambda e: (-e["n"], e["last"]), reverse=False),
                    "unsigned": not p.get("rostered", True)})
    auto_ids = {b["id"] for b in out}
    # a hand-added entry for the same player stays (yours wins); the news entry is dropped
    auto_names = {C.norm(b["name"]) for b in out}
    keep_manual = [m for m in manual if m.get("id") not in auto_ids and C.norm(m.get("name", "")) not in auto_names]
    return keep_manual + sorted(out, key=lambda b: b["lastSeen"], reverse=True) if auto_ids or keep_manual else []


def main() -> None:
    cands = C.OUT if C.OUT.exists() else None
    if not cands:
        print("no contracts file to add the trade block to; run contracts.py first"); return
    c = json.loads(C.OUT.read_text())
    by_name = candidates()
    items = []
    for site, url in FEEDS:
        for it in C.phr_items(url, 0.4):  # plain RSS 2.0, same shape on all three sites
            items.append({**it, "site": site})
    seen, uniq = set(), []
    for it in items:
        if it["url"] not in seen:
            seen.add(it["url"]); uniq.append(it)
    signals = scan(uniq, by_name)
    c["block"] = build(c.get("block", []), signals, by_name, date.today())
    c["blockAt"] = datetime.now(timezone.utc).isoformat()
    C.write(c)
    auto = [b for b in c["block"] if b.get("auto")]
    print(f"{len(uniq)} news items, {len(signals)} signals; trade block: {len(auto)} from news + {len(c['block']) - len(auto)} added by hand")
    for b in auto:
        print(f"  {b['team']} {b['name']}: {b['status']} ({b['reports']} reports, last {b['lastSeen']})")


def run_logged() -> None:
    started = datetime.now(timezone.utc)
    ok, err, notes, health = True, None, {}, []
    try:
        main()
        c = json.loads(C.OUT.read_text()) if C.OUT.exists() else {}
        auto = [b for b in c.get("block", []) if b.get("auto")]
        notes = {"fromNews": len(auto), "requests": sum(b["status"] == "requested trade" for b in auto)}
        for h, v in C.by_host.items():
            if v.get("gaveUp"):
                health.append({"ok": False, "what": f"{h} feeds", "detail": f"{v['gaveUp']} feed(s) couldn't be read; last night's trade block entries are kept"})
    except Exception as e:  # noqa: BLE001
        ok, err = False, repr(e)
        raise
    finally:
        done = datetime.now(timezone.utc)
        import os
        gh = os.environ.get("GITHUB_RUN_ID")
        log = {"job": "trade-block", "ok": ok, "error": err, "startedAt": started.isoformat(), "finishedAt": done.isoformat(),
               "seconds": round((done - started).total_seconds(), 1), "sources": C.by_host, "notes": notes, "health": health,
               "outputs": ["public/hockey/contracts.json (block)"],
               "github": {"run": gh, "url": f"{os.environ.get('GITHUB_SERVER_URL')}/{os.environ.get('GITHUB_REPOSITORY')}/actions/runs/{gh}"} if gh else {"local": True}}
        (C.ROOT / "public" / "admin").mkdir(parents=True, exist_ok=True)
        (C.ROOT / "public" / "admin" / "run-trade-block.json").write_text(json.dumps(log))


if __name__ == "__main__":
    run_logged()

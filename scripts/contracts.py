#!/usr/bin/env python3
"""NHL contracts for Hockey Lab, gathered from several sources and ranked.

For every player on a current NHL roster, find his latest deal and fill in each field (term, cap hit, start season)
from the highest-priority source that has it:

    1. your edits on the site            (applied in the app; always win)
    2. NHL.com team press releases       official; most teams state the average annual value
    3. ProHockeyRumors                   news reports of signings, incl. depth deals (per-player news feeds)
    4. Wikipedia player articles         term and value for bigger deals
    5. Wikipedia team season pages       term and signing date (and the links to the team's press release)

Every value keeps its source, link and date, and disagreements are kept as alternatives.

    python3 scripts/contracts.py            # weekly: everything (pages are cached in .cache/contracts)
    python3 scripts/contracts.py --recent   # nightly: only the latest ProHockeyRumors news, applied to last run's file

Writes public/hockey/contracts.json (published to Firestore by scripts/publish.mjs, which never drops stored values).
Polite: one request at a time per site with pauses, cached pages reused, and a descriptive User-Agent.
"""
from __future__ import annotations

import gzip
import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get("CONTRACT_CACHE", ROOT / ".cache" / "contracts"))
OUT = ROOT / "public" / "hockey" / "contracts.json"
PREV = Path(os.environ.get("PREV_DIR", ROOT / "prev")) / "hockey" / "contracts.json"
UA = {"User-Agent": "hockey-lab-contracts/1.0 (personal, non-commercial research)"}
CAP = {"season": "20262027", "upper": 104_000_000, "source": "PuckPedia (puckpedia.com/teams), checked 2026-10-12"}
PRIORITY = {"nhl.com": 2, "ProHockeyRumors": 3, "Wikipedia article": 4, "Wikipedia season page": 5}
DELAY = {"en.wikipedia.org": 3.0, "www.nhl.com": 2.0, "www.prohockeyrumors.com": 3.0, "api-web.nhle.com": 0.5}
PAGES = {
    "ANA": "Anaheim Ducks", "BOS": "Boston Bruins", "BUF": "Buffalo Sabres", "CGY": "Calgary Flames", "CAR": "Carolina Hurricanes",
    "CHI": "Chicago Blackhawks", "COL": "Colorado Avalanche", "CBJ": "Columbus Blue Jackets", "DAL": "Dallas Stars", "DET": "Detroit Red Wings",
    "EDM": "Edmonton Oilers", "FLA": "Florida Panthers", "LAK": "Los Angeles Kings", "MIN": "Minnesota Wild", "MTL": "Montreal Canadiens",
    "NSH": "Nashville Predators", "NJD": "New Jersey Devils", "NYI": "New York Islanders", "NYR": "New York Rangers", "OTT": "Ottawa Senators",
    "PHI": "Philadelphia Flyers", "PIT": "Pittsburgh Penguins", "SJS": "San Jose Sharks", "SEA": "Seattle Kraken", "STL": "St. Louis Blues",
    "TBL": "Tampa Bay Lightning", "TOR": "Toronto Maple Leafs", "VAN": "Vancouver Canucks", "VGK": "Vegas Golden Knights",
    "WSH": "Washington Capitals", "WPG": "Winnipeg Jets", "UTA": "Utah Mammoth",
}
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                      "September", "October", "November", "December"], 1)}
NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8}
MONEY = r"\$\s?([\d.,]+)\s*(million|MM\b|M\b|K\b)?"
TERM = r"\b(one|two|three|four|five|six|seven|eight|[1-8])[- ]year\b(?=(?:[^.]|\.(?=\d)){0,45}?\b(?:contract|extension|deal|pact|ELC)\b)"
SPECULATION = re.compile(r"\b(comparable|could|would|might|may|projected|projection|projects?|projecting|pegged|AFP Analytics|estimated?|estimates|predict\w*|will|likely|expected to|asking|seeking|ask|rumou?r|reportedly looking|in line for|similar to|like\s+[A-Z])", re.I)
# Sentences that recall an older deal ("originally signed ... in 2019", "the final year of an eight-year contract"): dated by
# what they say, not by the article's date; dropped when they don't say when
HIST_REJECT = re.compile(r"\b(originally|at the time of signing|inaugural season|last contract|previous contract|prior contract|years ago)\b", re.I)
ORDINAL = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8}
NAME = re.compile(r"\b[A-Z][a-z]+(?:[- ][A-Z][a-z]+)*\s+[A-Z][a-zA-Z'’-]+")

_last: dict[str, float] = {}
fetched = {"network": 0, "cache": 0}
by_host: dict[str, dict] = {}  # for the admin panel's run log


def tally(host: str, kind: str) -> None:
    by_host.setdefault(host, {"requests": 0, "cached": 0, "failed": 0, "retried": 0, "recovered": 0, "gaveUp": 0})[kind] += 1


def get(url: str, max_age_days: float | None, as_json: bool = False, params: dict | None = None):
    """GET with a disk cache (max_age_days None = keep forever) and per-site pauses. Returns None on failure."""
    full = url + ("?" + urllib.parse.urlencode(params) if params else "")
    path = CACHE / (hashlib.sha1(full.encode()).hexdigest() + ".gz")
    if path.exists() and (max_age_days is None or time.time() - path.stat().st_mtime < max_age_days * 86400):
        fetched["cache"] += 1
        tally(urllib.parse.urlparse(url).netloc, "cached")
        text = gzip.open(path, "rt").read()
        return json.loads(text) if as_json else text
    host = urllib.parse.urlparse(url).netloc
    def give_up():
        if attempt:
            tally(host, "retried"); tally(host, "gaveUp")
        return None
    attempt = 0
    for attempt in range(4):
        wait = DELAY.get(host, 2.0) - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        try:
            r = requests.get(full, headers=UA, timeout=45)
        except requests.RequestException:
            tally(host, "requests"); tally(host, "failed")
            time.sleep(5 * (attempt + 1)); continue
        if r.status_code == 429 or r.status_code >= 500:
            tally(host, "requests"); tally(host, "failed")  # rate-limited or server error: wait and retry
            time.sleep(int(r.headers.get("Retry-After", 20)) + 10 * attempt); continue
        tally(host, "requests")
        if r.status_code != 200:
            tally(host, "failed")
            return give_up()
        fetched["network"] += 1
        if attempt:
            tally(host, "retried"); tally(host, "recovered")  # failed at first, fine on a retry
        path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(path, "wt") as f:
            f.write(r.text)
        return r.json() if as_json else r.text
    return give_up()


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", s.replace("-", " ")).strip()


def strip_markup(s: str) -> str:
    s = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\{\{efn.*?\}\}", "", s, flags=re.S)
    s = re.sub(r"<sup>.*?</sup>", "", s, flags=re.S)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"'''?|<[^>]+>", "", s)
    return s.strip()


def money(num: str, unit: str | None) -> float:
    v = float(num.replace(",", ""))
    return v * 1e6 if unit and unit.lower().startswith("m") else v * 1e3 if unit and unit.lower() == "k" else v


def deal_from_text(text: str) -> dict | None:
    """Term and cap hit from one passage: 'a three-year contract extension with an average annual value of $3.2 million',
    'signed a two-year, $1.55MM deal'. Returns {term, aav, ext, elc, start} or None."""
    m = re.search(TERM, text, re.I)
    if not m:
        if re.search(r"entry[- ]level (?:contract|deal)", text, re.I) and re.search(r"\bsign", text, re.I):
            return {"term": None, "aav": None, "ext": False, "elc": True, "start": None}
        return None
    term = NUM.get(m.group(1).lower()) or int(m.group(1))
    aav = re.search(r"(?:average annual value|AAV|cap hit|annual average|per season|per year|annually)[^$]{0,30}" + MONEY, text, re.I) \
        or re.search(MONEY + r"[^.$]{0,20}(?:AAV|cap hit|per season|per year|annually|average annual value)", text, re.I)
    v = None
    if aav:
        v = money(aav.group(1), aav.group(2))
    else:
        tot = re.match(r",?\s+(?:[a-z-]+\s+)?" + MONEY, text[m.end():], re.I) \
            or re.search(r"(?:worth|valued at|totaling|totalling|for)\s+(?:a total of\s+)?" + MONEY, text[m.end():m.end() + 120], re.I)  # "two-year, $1.55MM" / "worth $800,000"
        if tot:
            total = money(tot.group(1), tot.group(2).replace("MM", "M") if tot.group(2) else ("M" if "MM" in text[m.end():m.end() + 20] else None))
            v = total / term
    if v is not None and not 500_000 <= v <= 20_000_000:
        v = None
    st = re.search(r"(?:begin|begins|began|beginning|start|starts|starting|kicks? in|effective|through)[^.]{0,30}?(20\d\d)[–-](?:20)?\d\d season", text, re.I)
    return {"term": term, "aav": int(round(v, -3)) if v else None, "ext": "extension" in text.lower(),
            "elc": "entry-level" in text.lower(), "start": int(st.group(1)) if st and "through" not in st.group(0).lower() else None}


# ---------------- Source 5: Wikipedia team season pages ----------------
def season_title(team: str, season: str) -> str:
    y = int(season[:4])
    name = PAGES[team]
    if team == "UTA":
        name = "Arizona Coyotes" if y < 2024 else "Utah Hockey Club" if y == 2024 else "Utah Mammoth"
    return f"{y}–{str(y + 1)[2:]} {name} season"


def wikitext(title: str, max_age: float | None) -> str:
    d = get("https://en.wikipedia.org/w/api.php", max_age, as_json=True,
            params={"action": "parse", "page": title, "prop": "wikitext", "format": "json", "formatversion": 2, "redirects": 1})
    return (d or {}).get("parse", {}).get("wikitext", "") if d else ""


def parse_date(cell: str) -> str | None:
    m = re.search(r"\{\{\s*(?:start )?date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", cell, re.I)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    m = re.search(r"([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})", strip_markup(cell))
    if m and m.group(1) in MONTHS:
        return date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))).isoformat()
    return None


def season_signings(team: str, season: str, cur: str) -> list[dict]:
    title = season_title(team, season)
    w = wikitext(title, None if season < cur else 7)
    out = []
    for sec in ("Signings", "Free agents", "Free agency"):
        m = re.search(r"^===*\s*" + sec + r"\s*=*=\s*$", w, re.M)
        if not m:
            continue
        body = w[m.end():]
        t0 = body.find("{|"); t1 = body.find("|}", t0)
        if t0 < 0 or t1 < 0:
            continue
        table = body[t0:t1]
        header = re.search(r"\n!(.*?)\n\|-", table, re.S)
        cols = [strip_markup(c).lower() for c in re.split(r"!!|\n!", header.group(1))] if header else []
        col = lambda *ns: next((i for i, c in enumerate(cols) if any(n in c for n in ns)), None)
        cd, cp, ct, cteam = col("date"), col("player"), col("term", "length"), col("team")
        if cp is None:
            continue
        for row in re.split(r"\n\|-[^\n]*", table)[1:]:
            cells = [c.strip() for c in re.split(r"\n\||\|\|", "\n" + row.strip()) if c.strip() and not c.strip().startswith("!")]
            if len(cells) <= cp:
                continue
            if sec != "Signings" and (cteam is None or cteam >= len(cells) or not re.match(r"\s*from\b", strip_markup(cells[cteam]), re.I)):
                continue  # a player leaving: his new team's page has the deal
            link = re.search(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", cells[cp])
            sort = re.search(r"\{\{sortname\|([^|}]+)\|([^|}]+)(?:\|([^|}]+))?", cells[cp], re.I)
            if link:
                article, shown = link.group(1).strip(), (link.group(2) or link.group(1)).strip()
            elif sort:
                shown = f"{sort.group(1)} {sort.group(2)}"; article = sort.group(3) or shown
            else:
                continue
            tm = re.search(r"(\d)\s*-?\s*year", strip_markup(cells[ct]) if ct is not None and ct < len(cells) else "", re.I)
            out.append({"source": "Wikipedia season page", "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
                        "name": re.sub(r"\s*\(.*?\)", "", shown), "article": article, "team": team,
                        "date": parse_date(cells[cd]) if cd is not None and cd < len(cells) else None,
                        "term": int(tm.group(1)) if tm else None, "aav": None, "ext": "extension" in row.lower(), "start": None, "elc": "entry-level" in row.lower(),
                        "releases": re.findall(r"url=(https?://www\.nhl\.com/[^\s|}]+)", row)})
    return out


# ---------------- Source 4: Wikipedia player articles ----------------
def articles(titles: list[str]) -> dict[str, str]:
    out = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        d = get("https://en.wikipedia.org/w/api.php", 7, as_json=True, params={
            "action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "format": "json",
            "formatversion": 2, "redirects": 1, "titles": "|".join(batch)})
        if not d:
            continue
        q = d["query"]
        back = {x["to"]: x["from"] for x in q.get("normalized", []) + q.get("redirects", [])}
        back = {k: back.get(v, v) for k, v in back.items()}
        for p in q.get("pages", []):
            if "revisions" in p:
                out[back.get(p["title"], p["title"])] = p["revisions"][0]["slots"]["main"]["content"]
    return out


def is_bio(text: str | None) -> bool:
    return bool(text) and "infobox ice hockey" in text.lower() and "may refer to" not in text[:3000]


DATE_RX = re.compile(r"\b(?:([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})|(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4}))")


def article_deals(text: str, url: str) -> list[dict]:
    plain = strip_markup(re.sub(r"<ref.*?(?:</ref>|/>)", "", text, flags=re.S))
    out, last_date = [], None
    for sent in re.split(r"(?<=[a-z0-9)])\.\s+(?=[A-Z])", plain):
        dm = DATE_RX.search(sent)
        if dm:
            mo, dd, yy = (dm.group(1), dm.group(2), dm.group(3)) if dm.group(1) else (dm.group(5), dm.group(4), dm.group(6))
            if mo in MONTHS:
                last_date = date(int(yy), MONTHS[mo], int(dd)).isoformat()
        d = deal_from_text(sent)
        if not d or EUROPE.search(sent):
            continue
        y = re.findall(r"\b(20[0-3]\d)\b", sent)
        when = last_date if dm or (last_date and y and last_date[:4] in y) else (f"{y[0]}-07-01" if y else None)
        if when:
            out.append({"source": "Wikipedia article", "url": url, "date": when, "quote": sent.strip()[:240], **d})
    return out


# ---------------- Source 2: NHL.com team press releases ----------------
def release_deal(url: str) -> dict | None:
    page = get(url, None)  # a press release doesn't change
    if not page:
        return None
    m = re.search(r'"articleBody":"(.*?)","', page, re.S)
    text = html.unescape(m.group(1).encode().decode("unicode_escape", "ignore") if m else re.sub(r"<[^>]+>", " ", page))
    text = " ".join(text.replace("*", "").split())
    for para in re.split(r"(?<=[a-z0-9)])\.\s+(?=[A-Z])", text)[:6]:  # the deal is in the opening lines
        d = deal_from_text(para)
        if d:
            dm = re.search(r'"datePublished":"(\d{4}-\d\d-\d\d)', page)
            return {"source": "nhl.com", "url": url, "date": dm.group(1) if dm else None, "quote": para[:240], **d}
    return None


# ---------------- Source 3: ProHockeyRumors ----------------
def phr_slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s.replace(".", "").replace("'", "")).strip("-")


def phr_items(url: str, max_age: float) -> list[dict]:
    x = get(url, max_age)
    if not x:
        return []
    items = []
    for it in re.findall(r"<item>(.*?)</item>", x, re.S):
        title = html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", re.search(r"<title>(.*?)</title>", it, re.S).group(1)))
        link = re.search(r"<link>(.*?)</link>", it).group(1)
        pub = parsedate_to_datetime(re.search(r"<pubDate>(.*?)</pubDate>", it).group(1)).date().isoformat()
        body = re.search(r"<content:encoded><!\[CDATA\[(.*?)\]\]>", it, re.S)
        text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", body.group(1) if body else "")).split())
        text = re.sub(r"\s+([.,;:])", r"\1", text)  # "Lucas Raymond . The deal" (left by removed links)
        items.append({"title": title, "url": link, "date": pub, "text": text})
    return items


OTHERS: set[str] = set()      # every rostered player's full name (normalized), filled in main()
OTHER_LAST: set[str] = set()  # and last names, for possessives ("Marchenko's")
EUROPE = re.compile(r"\b(SHL|KHL|Liiga|DEL|Swiss|Switzerland|Sweden|Swedish|Finland|Finnish|Czech|Extraliga|Germany|German|National League|overseas|Europe|European)\b", re.I)


def deal_date(text: str, item_date: str, d: dict) -> str | None:
    """When a deal in a news sentence was signed: the article's date, unless the sentence says otherwise. Sets d["start"]
    for 'the final year of an eight-year contract'. None when it recalls an older deal without saying when."""
    day = date.fromisoformat(item_date)
    season = day.year if day.month >= 7 else day.year - 1  # the season the article is about
    m = re.search(r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2}),\s+(20\d\d)", text)
    if m:
        when = date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
        if when < day - timedelta(days=60):
            return when.isoformat()
    m = re.search(r"\b(?:in|back in|signed in|during|of)\s+(20\d\d)\b(?![–-])", text)
    if m and int(m.group(1)) < day.year:
        return f"{m.group(1)}-07-01"
    if re.search(r"\blast (?:summer|offseason|off-season)\b", text, re.I):
        return f"{day.year - 1}-07-01"
    m = re.search(r"\b(final|last|" + "|".join(ORDINAL) + r") year of (?:an? |his )?", text, re.I)
    if m and d.get("term"):
        k = d["term"] if m.group(1).lower() in ("final", "last") else ORDINAL[m.group(1).lower()]
        d["start"] = season - k + 1
        return item_date
    if HIST_REJECT.search(text):
        return None
    return item_date


def phr_deals(name: str, items: list[dict]) -> list[dict]:
    """Deals in news posts, only from sentences that name the player (roundup posts cover many players)."""
    last = norm(name).split()[-1]
    out = []
    for it in items:
        for sent in re.split(r"(?<=[a-z0-9)])\.\s+(?=[A-Z])", it["text"]):
            if last not in norm(sent) or EUROPE.search(sent):
                continue
            sp = SPECULATION.search(sent)
            part = sent[:sp.start()] if sp else sent  # "signed a one-year deal for $12MM, where he will exceed $15MM" -> the fact only
            d = deal_from_text(part)
            if d and re.search(r"\bsign|extension|agree|inked|deal|contract\b", part, re.I):
                when = deal_date(part, it["date"], d)
                if when is None:
                    continue
                if when != it["date"]:
                    d = {**d, "ext": False} if "extension" not in part.lower() else d
                # a sentence that also names another NHL player ("... like Tim Stützle and his eight-year deal",
                # "Marchenko's six-year extension") is about someone else's deal, or comparing
                ns = norm(sent)
                if any(o in ns for o in OTHERS if o != norm(name)) or any(f"{l}s " in ns.replace("’", "").replace("'", "") for l in OTHER_LAST if l != last):
                    continue
                out.append({"source": "ProHockeyRumors", "url": it["url"], "date": when, "quote": part[:240], **d})
                break
    return out


# ---------------- Combine ----------------
def start_season(d: dict) -> tuple[int, bool]:
    if d.get("start"):
        return d["start"], False
    day = date.fromisoformat(d["date"])
    start = day.year + (1 if d.get("ext") and day.month >= 7 else 0)
    if not d.get("ext") and day.month <= 2:
        start = day.year - 1
    return start, day.month >= 9 or day.month <= 2


def elc_years(born: str | None, signed: str) -> int | None:
    """Entry-level contract length by age at signing (CBA): 18-21 -> 3, 22-23 -> 2, 24+ -> 1."""
    if not born:
        return None
    b, s_ = date.fromisoformat(born), date.fromisoformat(signed)
    age = s_.year - b.year - ((s_.month, s_.day) < (b.month, b.day))
    return 3 if age <= 21 else 2 if age <= 23 else 1


def summarize(deals: list[dict], cur_start: int) -> dict | None:
    """The newest deal in `deals`, its fields filled from the highest-priority source that reported it."""
    if not deals:
        return None
    latest = max(deals, key=lambda d: (d["date"], -PRIORITY[d["source"]]))
    day = date.fromisoformat(latest["date"])
    same = [d for d in deals if abs((date.fromisoformat(d["date"]) - day).days) <= 150 and d["term"] == latest["term"]]
    same.sort(key=lambda d: PRIORITY[d["source"]])
    pick = lambda f: next((d for d in same if d.get(f)), None)
    t, a, s = pick("term"), pick("aav"), pick("start")
    start, guessed = start_season(s or latest)
    # Called an "extension" but signed after his previous deal had already run out (an RFA re-signing in
    # September, say): it covers the season about to start, not the next one.
    older = [d for d in deals if date.fromisoformat(d["date"]) < day - timedelta(days=150) and d.get("term")]
    if not (s and s.get("start")) and older and latest.get("ext") and day.month >= 7:
        prev = max(older, key=lambda d: d["date"])
        prev_start, _ = start_season(prev)
        if prev_start + prev["term"] - 1 < day.year:
            start = day.year
    out = {"term": t["term"], "signed": latest["date"], "start": start, "end": start + t["term"] - 1, "startGuessed": guessed,
           "elc": any(d.get("elc") for d in same), "aav": None, "src": {"term": {"source": t["source"], "url": t["url"], "date": t["date"]}}, "alts": []}
    if a:
        out["aav"] = a["aav"]
        out["src"]["aav"] = {"source": a["source"], "url": a["url"], "date": a["date"], "quote": a.get("quote")}
        out["alts"] = [{"source": d["source"], "aav": d["aav"], "url": d["url"]} for d in same if d.get("aav") and d is not a and abs(d["aav"] - a["aav"]) > 25_000]
    out["_day"] = day
    return out


def resolve(player: dict, deals: list[dict], cur_start: int) -> dict:
    for d in deals:
        if d.get("elc") and not d.get("term") and d.get("date"):
            d["term"], d["termFromAge"] = elc_years(player.get("born"), d["date"]), True
    row = {**player, "term": None, "signed": None, "start": None, "end": None, "aav": None, "status": "unknown",
           "startGuessed": False, "elc": False, "src": {}, "alts": []}
    deals = [d for d in deals if d.get("date") and d.get("term")]
    main = summarize(deals, cur_start)
    if not main:
        return row
    nxt = None
    if main["start"] > cur_start:
        # an extension that hasn't started: this season is still played on the deal before it
        before = [d for d in deals if date.fromisoformat(d["date"]) < main["_day"] - timedelta(days=30)]
        cur = summarize(before, cur_start)
        if cur and cur["start"] <= cur_start <= cur["end"]:
            main, nxt = cur, main
    main.pop("_day", None)
    row.update(main, status="signed" if main["end"] >= cur_start else "expired?")
    if nxt:
        nxt.pop("_day", None)
        row["next"] = {k: nxt[k] for k in ("term", "signed", "start", "end", "aav", "elc", "src")}
    return row


def nhl(url: str, max_age: float = 0.5):
    return get(f"https://api-web.nhle.com/v1/{url}", max_age, as_json=True)


def main() -> None:
    recent = "--recent" in sys.argv
    cur = str(nhl("club-schedule-season/DET/now")["currentSeason"])
    cur_start = int(cur[:4])
    teams = sorted(t["teamAbbrev"]["default"] for t in nhl("standings/now")["standings"])
    rosters = {}
    for t in teams:
        r = nhl(f"roster/{t}/current") or {}
        for grp in ("forwards", "defensemen", "goalies"):
            for p in r.get(grp, []):
                rosters[p["id"]] = {"id": p["id"], "name": f"{p['firstName']['default']} {p['lastName']['default']}", "team": t,
                                    "pos": p.get("positionCode"), "born": p.get("birthDate")}
    print(f"{len(rosters)} players on current NHL rosters")
    OTHERS.update(norm(p["name"]) for p in rosters.values())
    OTHER_LAST.update(norm(p["name"]).split()[-1] for p in rosters.values() if len(norm(p["name"]).split()[-1]) > 3)
    # last run: the stored copy (restored from Firestore), or a newer full build committed as model/contracts.json
    cands = [json.loads(p.read_text()) for p in (PREV, ROOT / "model" / "contracts.json", OUT) if p.exists()]
    prev = max(cands, key=lambda c: c.get("builtAt", "")) if cands else None  # the latest full build wins

    if recent:  # nightly: just apply the latest signing news to last run's list
        if not prev:
            print("no previous contracts file; run the full job first"); return
        items = phr_items("https://www.prohockeyrumors.com/feed", 0.4) + phr_items("https://www.prohockeyrumors.com/category/transactions/feed", 0.4)
        by_id = {p["id"]: p for p in prev["players"]}
        n = 0
        for pid, p in rosters.items():
            ds = phr_deals(p["name"], [it for it in items if norm(p["name"]).split()[-1] in norm(it["title"])])
            old = by_id.get(pid)
            if ds and (not old or not old.get("signed") or ds[0]["date"] > old["signed"]):
                new = resolve(p, ds, cur_start); n += 1
                if old and old.get("status") == "signed" and (new.get("start") or 0) > cur_start and (old.get("start") or 0) <= cur_start:
                    # an extension in the news: this season's deal stays, the extension goes alongside it
                    old.update(team=p["team"], next={k: new.get(k) for k in ("term", "signed", "start", "end", "aav", "elc", "src")})
                else:
                    by_id[pid] = new
            elif old:
                old.update(team=p["team"])  # trades: keep the deal, update the team
        for pid in set(by_id) - set(rosters):
            by_id[pid]["onRoster"] = False
        prev.update(players=sorted(by_id.values(), key=lambda r: (r["team"], r["name"])), asOf=date.today().isoformat(),
                    newsAt=datetime.now(timezone.utc).isoformat())  # builtAt stays the full build's time
        write(prev)
        print(f"recent: {len(items)} news items, {n} contracts updated")
        return

    # Source 5: team season pages (2019-20 on covers every deal that can still be running)
    seasons = [f"{y}{y + 1}" for y in range(2019, cur_start + 1)]
    signings = [x for s in seasons for t in PAGES for x in (season_signings(t, s, cur) if not (t == "SEA" and s < "20212022") else [])]
    by_name: dict[str, list[dict]] = {}
    for x in signings:
        by_name.setdefault(norm(x["name"]), []).append(x)
    print(f"Wikipedia season pages: {len(signings)} signings")

    # Source 4: player articles (try the linked title, then disambiguations)
    titles = {pid: [x["article"] for x in by_name.get(norm(p["name"]), [])[-1:]] + [p["name"], f"{p['name']} (ice hockey)",
              f"{p['name']} (ice hockey, born {str(p.get('born') or '')[:4]})"] for pid, p in rosters.items()}
    texts = {}
    for k in range(4):
        want = sorted({t[k] for pid, t in titles.items() if k < len(t) and not is_bio(texts.get(pid))})
        got = articles(want)
        for pid, t in titles.items():
            if k < len(t) and not is_bio(texts.get(pid)) and is_bio(got.get(t[k])):
                texts[pid] = got[t[k]]; titles[pid] = [t[k]]
    print(f"Wikipedia articles: {len(texts)} players")

    players, counts = [], {"nhl.com": 0, "ProHockeyRumors": 0}
    for i, (pid, p) in enumerate(sorted(rosters.items(), key=lambda kv: (kv[1]["team"], kv[1]["name"]))):
        url = "https://en.wikipedia.org/wiki/" + urllib.parse.quote(titles[pid][0].replace(" ", "_")) if pid in texts else None
        deals = [x for x in by_name.get(norm(p["name"]), []) if x["date"] and x["term"]]
        deals += article_deals(texts.get(pid, ""), url) if url else []
        cand = resolve(p, deals, cur_start)
        # Source 2: the team's press release for the latest deal (linked from the season page)
        if cand["signed"]:
            for x in deals:
                if x["source"] == "Wikipedia season page" and x["date"] and abs((date.fromisoformat(x["date"]) - date.fromisoformat(cand["signed"])).days) <= 150:
                    for u in x.get("releases", [])[:2]:
                        d = release_deal(u)
                        if d:
                            deals.append({**d, "date": d["date"] or x["date"]}); counts["nhl.com"] += 1
                            break
        # Source 3: ProHockeyRumors, when the cap hit is still missing or the deal may be newer than what we know
        cand = resolve(p, deals, cur_start)
        if not cand["aav"] or cand["status"] != "signed":
            items = phr_items(f"https://www.prohockeyrumors.com/players/{phr_slug(p['name'])}/feed", 7)
            ds = phr_deals(p["name"], items)
            if not ds and items and cand["signed"] and items[-1]["date"] > cand["signed"]:
                for page in (2, 3):  # older news, back to the signing
                    more = phr_items(f"https://www.prohockeyrumors.com/players/{phr_slug(p['name'])}/feed?paged={page}", 7)
                    ds = phr_deals(p["name"], more)
                    if ds or not more or more[-1]["date"] <= cand["signed"]:
                        break
            if ds:
                deals += ds; counts["ProHockeyRumors"] += 1
        players.append(resolve(p, deals, cur_start))
        if i % 100 == 99:
            print(f"  {i + 1}/{len(rosters)} players ({fetched['network']} pages fetched, {fetched['cache']} from cache)")

    block = (prev or {}).get("block", [])
    out = {"asOf": date.today().isoformat(), "builtAt": datetime.now(timezone.utc).isoformat(), "season": cur, "cap": CAP, "priority": PRIORITY,
           "sources": {"term": "NHL.com team releases, ProHockeyRumors, Wikipedia (CC BY-SA)", "aav": "NHL.com team releases, ProHockeyRumors, Wikipedia (CC BY-SA)",
                       "rosters": "NHL api-web.nhle.com current rosters"},
           "players": players, "block": block}
    write(out)
    signed = [r for r in players if r["status"] == "signed"]
    by_src = {}
    for r in signed:
        if r["aav"]:
            by_src[r["src"]["aav"]["source"]] = by_src.get(r["src"]["aav"]["source"], 0) + 1
    print(f"{len(signed)}/{len(players)} with a current deal; {sum(by_src.values())} with a cap hit {by_src}; pages: {fetched}")


def write(out: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out))


def run_logged() -> None:
    job = "contracts-news" if "--recent" in sys.argv else "contracts"
    started = datetime.now(timezone.utc)
    ok, err, notes, health = True, None, {}, []
    try:
        main()
        if OUT.exists():
            c = json.loads(OUT.read_text())
            ps = c.get("players", [])
            notes = {"players": len(ps), "withCurrentDeal": sum(p.get("status") == "signed" for p in ps),
                     "withCapHit": sum(bool(p.get("aav")) for p in ps if p.get("status") == "signed")}
            deal_share = notes["withCurrentDeal"] / max(1, notes["players"])
            health.append({"ok": deal_share >= 0.9, "what": "Players with a current deal", "detail": f"{notes['withCurrentDeal']} of {notes['players']} ({deal_share:.0%})"})
            health.append({"ok": notes["withCapHit"] >= 0.7 * notes["withCurrentDeal"], "what": "Current deals with a cap hit", "detail": f"{notes['withCapHit']} of {notes['withCurrentDeal']}; the rest show blank until a source or your edit fills them"})
        for h, v in by_host.items():
            if v.get("gaveUp"):
                health.append({"ok": False, "what": f"{h} requests", "detail": f"{v['gaveUp']} gave up after retries; those players keep last week's values"})
    except Exception as e:  # noqa: BLE001 - logged for the admin panel, then re-raised
        ok, err = False, repr(e)
        raise
    finally:
        done = datetime.now(timezone.utc)
        gh = os.environ.get("GITHUB_RUN_ID")
        log = {"job": job, "ok": ok, "error": err, "startedAt": started.isoformat(), "finishedAt": done.isoformat(),
               "seconds": round((done - started).total_seconds(), 1), "sources": by_host, "notes": notes, "health": health,
               "outputs": ["public/hockey/contracts.json"],
               "github": {"run": gh, "url": f"{os.environ.get('GITHUB_SERVER_URL')}/{os.environ.get('GITHUB_REPOSITORY')}/actions/runs/{gh}"} if gh else {"local": True}}
        (ROOT / "public" / "admin").mkdir(parents=True, exist_ok=True)
        (ROOT / "public" / "admin" / f"run-{job}.json").write_text(json.dumps(log))


if __name__ == "__main__":
    run_logged()

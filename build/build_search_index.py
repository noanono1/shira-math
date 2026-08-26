#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the site search index for Shira's math site.

Walks statistics/*.html, algebra/*.html, geometry/*.html and library.html and
produces one flat, self-contained index that the hub's search box reads.

What ends up in the index
-------------------------
For every page:
  t      — the short <title> (before the first " — ")
  items  — every searchable heading with its best anchor, in document order:
           h2/h3, the h4 of every exercise/model card (prefixed by its "דגם 3"/
           "א1" label), .box box-titles, details.alt/.more-x summaries, and the
           <b> of every library card.  Each item carries its own id when it has
           one, otherwise the nearest id above it — so a result lands on the
           section, not only on the page top.
  k      — the *hidden* search terms.  Nothing here is ever displayed: the UI
           shows the page title for a keyword hit, so k is free to hold
           synonyms, question forms and misspellings.

On top of the page entries the builder emits **anchor entries** — ordinary
entries whose "p" already carries a "#anchor".  They give a specific section
its own title + its own hidden keywords, which the flat {p,t,k,items} shape
could not otherwise express.  Their title is byte-identical to the matching
item's heading, so the UI's own de-duplication (href|title) keeps the dropdown
free of doubles.  Hidden text is harvested automatically from the page
("מתי זה הדגם שלך…", "זה התרגיל שלך אם…", group leads, finder-chip
descriptions and the folded reason lists) and extended by hand
from build/search-keywords.json.

Forgiveness (build/search-keywords.json)
----------------------------------------
  stems       — question/verb glue ("איך", "מה", "מוצאים"…) appended to every
                page entry, so "איך מוצאים חציון" still reaches the median
                page.  The UI requires every query word to appear, and these
                are the words that carry no meaning.
  typo_seeds  — the words she actually types.  Each one is auto-expanded into
                its ה/ב/ל/מ/ש/ו/כ prefixed forms, adjacent-letter swaps
                (חצוין), dropped י/ו (חצון) and ת/ט · כ/ח/ק · א/ע · ס/ש
                confusions (פיטגורס).  Spellings ride on the page entries
                only — a typo finds the page, and the section is one heading
                away from there.
  extra       — hand-written variants for anything the rules cannot guess.
  pages       — hidden terms for a whole page.
  targets     — hidden terms (and an optional display title) for one anchor.

Output: assets/search-index.js defining window.SHIRA_SEARCH =
  [{p:"algebra/02-equations.html", t:"משוואות ואי-שוויונות",
    k:["תחום הצבה",...], items:[{id:"sec-fractions", h:"משוואות עם שברים"},...]}, ...]

The build is pure: same inputs -> byte-identical output.  deploy.sh runs it.
"""
import html
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
KEYWORDS_FILE = SITE / "build" / "search-keywords.json"
OUT_FILE = SITE / "assets" / "search-index.js"

PAGE_GLOBS = [("statistics", "*.html"), ("algebra", "*.html"), ("geometry", "*.html"),
              ("grade9", "*.html")]
EXTRA_PAGES = ["library.html", "booklet.html"]

RE_TITLE = re.compile(r"<title>(.*?)</title>", re.S)
RE_ID = re.compile(r'\bid="([^"]+)"')
RE_HEADING = re.compile(r"<(h2|h3)([^>]*)>(.*?)</\1>", re.S)
RE_H4 = re.compile(r"<h4([^>]*)>(.*?)</h4>", re.S)
RE_LVL_H4 = re.compile(r'<span[^>]*class="[^"]*\blvl\b[^"]*"[^>]*>(.*?)</span>\s*<h4([^>]*)>(.*?)</h4>', re.S)
RE_BOXTITLE = re.compile(r'<div[^>]*class="[^"]*\b(?:box-title|fbox-title)\b[^"]*"[^>]*>(.*?)</div>', re.S)
RE_SUMMARY = re.compile(r'<details[^>]*class="[^"]*\b(?:alt|more-x)\b[^"]*"[^>]*>\s*<summary[^>]*>(.*?)</summary>', re.S)
# named cards that are links: the library's PDF cards and the exercise banks'
# "finder" chips.  When the link is an in-page one its own href is the anchor.
RE_CARD = re.compile(r'<a\s[^>]*href="([^"]*)"[^>]*>\s*<b>(.*?)</b>\s*(?:<span(?![^>]*class)[^>]*>(.*?)</span>)?', re.S)
# text that describes *when* a section is the one she needs — never displayed,
# indexed as hidden keywords for that section's anchor
RE_HINT = re.compile(r'<p[^>]*class="[^"]*\b(?:sig|gwhen|grouplead)\b[^"]*"[^>]*>(.*?)</p>', re.S)
# the folded reference lists — above all "הנימוקים המותרים": she looks a reason
# up by its own words, so every line of them becomes a hidden page keyword
RE_FOLDED = re.compile(r'<details[^>]*class="[^"]*\bmore-x\b[^"]*"[^>]*>(.*?)</details>', re.S)
RE_LI = re.compile(r"<li>(.*?)</li>", re.S)

# "החציון" · "מהנתונים" · "שהמשולש" — she types the word with whatever glue
# the sentence in her head needs, and the UI matches literal substrings
PREFIXES = ("ה", "ב", "ל", "מ", "ש", "ו", "כ",
            "מה", "שה", "כש", "לה")
MATRES = "וי"
CONFUSE = [("ת", "ט"), ("כ", "ח"), ("כ", "ק"), ("א", "ע"), ("ס", "ש")]
MAX_ITEM_LEN = 80
MIN_ITEM_LEN = 3


def clean_text(raw):
    """HTML fragment -> plain searchable Hebrew text (no tags, no KaTeX)."""
    t = re.sub(r'<span[^>]*class="[^"]*\b(?:num|cnt)\b[^"]*"[^>]*>.*?</span>', "", raw, flags=re.S)
    t = re.sub(r'<span[^>]*class="[^"]*\bfi\b[^"]*"[^>]*>.*?</span>', " ", t, flags=re.S)
    t = re.sub(r"\\\((?:.*?)\\\)", " ", t, flags=re.S)  # stray KaTeX source
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    t = t.replace("‏", "").replace("‎", "")
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+([,.:;])", r"\1", t)
    return t


def short_title(page_html):
    m = RE_TITLE.search(page_html)
    if not m:
        return ""
    return clean_text(m.group(1)).split(" — ")[0].strip()


# ---------------------------------------------------------------- variants ---

def _prefixed(word):
    return [p + word for p in PREFIXES]


def _swaps(word):
    """Adjacent-letter swaps — the typo she actually makes (חציון -> חצוין)."""
    return [word[:i] + word[i + 1] + word[i] + word[i + 2:] for i in range(len(word) - 1)]


def _drop_matres(word):
    return [word[:i] + word[i + 1:] for i, ch in enumerate(word) if ch in MATRES]


def _confusions(word):
    out = []
    for a, b in CONFUSE:
        for src, dst in ((a, b), (b, a)):
            for i, ch in enumerate(word):
                if ch == src:
                    out.append(word[:i] + dst + word[i + 1:])
    return out


def seed_variants(word):
    """Every spelling of `word` a tired 15-year-old might actually type."""
    if len(word) < 4:
        return []
    out = set(_prefixed(word)) | set(_swaps(word)) | set(_drop_matres(word)) | set(_confusions(word))
    out.discard(word)
    return sorted(out)


def expand_terms(terms, seeds, extra, misspellings=True):
    """Curated terms -> the hidden blob (terms, synonyms and spellings).

    misspellings=False keeps a section's blob lean: a typo still finds the
    page, and from the page the section is one heading away.
    """
    out = []
    seen = set()

    def add(s):
        s = s.strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)

    for term in terms:
        add(term)
        words = [w for w in re.split(r"[\s·,]+", term) if w]
        for w in words:
            for v in extra.get(w, []):
                add(v)
            if misspellings and w in seeds:
                for v in seed_variants(w):
                    add(v)
        if len(words) == 1 and len(words[0]) >= 3 and words[0] not in seeds:
            add("ה" + words[0])
    return out


# ------------------------------------------------------------------- pages ---

def extract_items(page_html):
    """Every searchable heading with its best anchor, in document order.

    Rank 0 = a real heading, rank 1 = a box title / summary chip.  When the same
    words appear as both (the exercise banks repeat every group name inside
    their "finder" box), the heading wins — it is the one with the useful
    anchor, while the chip only points back at the finder.
    """
    id_positions = [(m.start(), m.group(1)) for m in RE_ID.finditer(page_html)]

    def nearest_id(offset):
        best = ""
        for pos, id_ in id_positions:
            if pos < offset:
                best = id_
            else:
                break
        return best

    found = []  # (offset, id, text, rank)
    for m in RE_HEADING.finditer(page_html):
        own = RE_ID.search(m.group(2))
        anchor = own.group(1) if own else nearest_id(m.start())
        found.append((m.start(), anchor, clean_text(m.group(3)), 0))

    # exercise / model cards: "דגם 3 · שווה-שוקיים…", "א1 · כינוס איברים דומים"
    labelled = {}
    for m in RE_LVL_H4.finditer(page_html):
        lvl, attrs, body = clean_text(m.group(1)), m.group(2), clean_text(m.group(3))
        text = (lvl + " · " + body) if lvl and body else (lvl or body)
        labelled[m.end()] = True
        own = RE_ID.search(attrs)
        anchor = own.group(1) if own else nearest_id(m.start())
        found.append((m.start(), anchor, text, 0))
    for m in RE_H4.finditer(page_html):
        if m.end() in labelled:
            continue
        own = RE_ID.search(m.group(1))
        anchor = own.group(1) if own else nearest_id(m.start())
        found.append((m.start(), anchor, clean_text(m.group(2)), 0))

    for regex in (RE_BOXTITLE, RE_SUMMARY):
        for m in regex.finditer(page_html):
            found.append((m.start(), nearest_id(m.start()), clean_text(m.group(1)), 1))

    for m in RE_CARD.finditer(page_html):
        href = m.group(1)
        anchor = href[1:] if href.startswith("#") else nearest_id(m.start())
        found.append((m.start(), anchor, clean_text(m.group(2)), 0))

    best = {}
    for offset, anchor, text, rank in found:
        # a chip that reads "7", or a heading whose payload was the formula
        # that clean_text just removed ("המבנה:"), is not a result she can read
        if not (MIN_ITEM_LEN <= len(text) <= MAX_ITEM_LEN):
            continue
        if text.rstrip(":.").strip().isdigit() or text.endswith(":"):
            continue
        if text not in best or (rank, offset) < best[text][:2]:
            best[text] = (rank, offset, anchor)
    items = [{"id": a, "h": t}
             for t, (_, _, a) in sorted(best.items(), key=lambda kv: kv[1][1])]
    # the section title a human wrote, preferred over a nav chip's short label
    headings = {t for t, (rank, _, _) in best.items() if rank == 0}
    return items, headings


def extract_hints(page_html):
    """Hidden 'this is the one you need if…' text, by anchor.

    Two sources, neither of them ever displayed: the "מתי זה הדגם שלך"/"זה
    התרגיל שלך אם" paragraphs, and the one-line description under every finder
    chip ("פתרון וסימון על ציר · היפוך הסימן · תחום הצבה").  Returns
    (by_anchor, for_the_page) — a card that links out of the page (a PDF in the
    library) has no anchor to hang on, so its description feeds the page.
    """
    id_positions = [(m.start(), m.group(1)) for m in RE_ID.finditer(page_html)]

    def nearest_id(offset):
        best = ""
        for pos, id_ in id_positions:
            if pos < offset:
                best = id_
            else:
                break
        return best

    hints, page_hints = {}, []
    for m in RE_HINT.finditer(page_html):
        anchor = nearest_id(m.start())
        text = clean_text(m.group(1))
        text = re.sub(r"^(מתי זה הדגם שלך|זה התרגיל שלך אם)\s*:?\s*", "", text)
        if text and anchor:
            hints.setdefault(anchor, []).append(text[:170])
    for m in RE_CARD.finditer(page_html):
        desc = clean_text(m.group(3) or "")
        if not desc:
            continue
        href = m.group(1)
        if href.startswith("#"):
            hints.setdefault(href[1:], []).append(desc[:170])
        else:
            page_hints.append(desc[:170])
    for block in RE_FOLDED.finditer(page_html):
        for li in RE_LI.finditer(block.group(1)):
            line = clean_text(li.group(1))
            if 4 <= len(line) <= 90:
                page_hints.append(line)
    return {a: " ".join(v)[:300] for a, v in hints.items()}, page_hints


def main():
    raw = json.loads(KEYWORDS_FILE.read_text(encoding="utf-8")) if KEYWORDS_FILE.exists() else {}
    if "pages" not in raw and "targets" not in raw:  # legacy flat {page: [terms]}
        raw = {"pages": raw}
    stems = raw.get("stems", [])
    seeds = set(raw.get("typo_seeds", []))
    extra = raw.get("extra", {})
    page_terms = raw.get("pages", {})
    targets = raw.get("targets", [])
    stem_blob = " ".join(stems)

    pages = []
    for subdir, glob in PAGE_GLOBS:
        for f in sorted((SITE / subdir).glob(glob)):
            pages.append(f.relative_to(SITE).as_posix())
    pages.extend(EXTRA_PAGES)

    problems = []
    index, by_page, anchors_of, hints_of, headings_of = [], {}, {}, {}, {}
    for rel in pages:
        f = SITE / rel
        if not f.exists():
            problems.append("missing page: " + rel)
            continue
        page_html = f.read_text(encoding="utf-8")
        # A module map (statistics/index.html …) is a page of shortcuts *into*
        # the lessons: indexing its chips would answer "פיתגורס" with the map
        # instead of the theorem.  Its title is destination enough.
        is_map = rel.endswith("/index.html")
        items, headings = ([], set()) if is_map else extract_items(page_html)
        anchor_hints, page_hints = extract_hints(page_html)
        entry = {"p": rel, "t": short_title(page_html), "items": items}
        if page_hints and not is_map:
            entry["_k"] = page_hints
        index.append(entry)
        by_page[rel] = entry
        anchors_of[rel] = set(RE_ID.findall(page_html))
        hints_of[rel] = {} if is_map else anchor_hints
        headings_of[rel] = headings

    # ---- anchor entries: a section with its own title and its own keywords ---
    anchor_entries = {}  # "page#id" -> entry

    def anchor_entry(page, anchor, title):
        key = page + ("#" + anchor if anchor else "")
        e = anchor_entries.get(key)
        if e is None:
            e = anchor_entries[key] = {"p": key, "t": title, "_k": [], "items": []}
        return e

    for rel, entry in by_page.items():
        titled = {}
        for it in entry["items"]:
            a = it["id"]
            if not a or a not in hints_of[rel]:
                continue
            if a not in titled or (it["h"] in headings_of[rel] and titled[a] not in headings_of[rel]):
                titled[a] = it["h"]
        for a, title in titled.items():
            anchor_entry(rel, a, title)["_k"].append(hints_of[rel][a])

    # ---- hand-curated targets ------------------------------------------------
    for tgt in targets:
        page, _, anchor = tgt["to"].partition("#")
        if page not in by_page:
            problems.append("target points at unknown page: " + tgt["to"])
            continue
        if anchor and anchor not in anchors_of[page]:
            problems.append("target anchor does not exist: " + tgt["to"])
            continue
        title = tgt.get("t", "")
        if not anchor and not title:
            by_page[page].setdefault("_k", []).extend(tgt.get("k", []))
            continue
        if not title:
            title = next((i["h"] for i in by_page[page]["items"] if i["id"] == anchor),
                         by_page[page]["t"])
        if not any(i["h"] == title for i in by_page[page]["items"]):
            # a destination the page never spelled out as a heading — give it one
            by_page[page]["items"].insert(0, {"id": anchor, "h": title})
        e = anchor_entry(page, anchor, title)
        e["_k"].extend(tgt.get("k", []))

    # ---- assemble the hidden keyword blobs ----------------------------------
    for rel, entry in by_page.items():
        terms = list(page_terms.get(rel, [])) + entry.pop("_k", [])
        k = expand_terms(terms, seeds, extra)
        if stem_blob:
            k.append(stem_blob)
        if k:
            entry["k"] = k
    # the stem blob lives on the page entries only: it is the same 350 bytes
    # every time, and a "איך …" question that reaches the page is one heading
    # away from the section.
    for e in anchor_entries.values():
        k = expand_terms(e.pop("_k"), seeds, extra, misspellings=False)
        if k:
            e["k"] = k
        index.append(e)

    index = [{k: e[k] for k in ("p", "t", "k", "items") if k in e} for e in index]

    unknown = sorted(set(page_terms) - set(by_page))
    if unknown:
        problems.append("keywords for unknown pages: %s" % unknown)
    for entry in index:
        page = entry["p"].split("#")[0]
        for it in entry["items"]:
            if it["id"] and it["id"] not in anchors_of[page]:
                problems.append("dead anchor %s#%s" % (page, it["id"]))

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    OUT_FILE.write_text(
        "/* auto-generated by build/build_search_index.py — do not edit by hand */\n"
        "window.SHIRA_SEARCH=" + payload + ";\n",
        encoding="utf-8",
    )
    n_items = sum(len(e["items"]) for e in index)
    n_terms = sum(len(e.get("k", [])) for e in index)
    size = OUT_FILE.stat().st_size
    print("search index: %d entries (%d pages + %d sections), %d items, %d hidden terms"
          % (len(index), len(by_page), len(anchor_entries), n_items, n_terms))
    print("              %s — %.1f KB" % (OUT_FILE.relative_to(SITE), size / 1024))
    # A stale curated target is skipped, never emitted: the index written above
    # is always valid, so a deploy is not held hostage to a renamed anchor.
    # Run with --strict (not from deploy.sh) to make the drift fail loudly.
    for p in problems:
        print("  !! " + p + "  → build/search-keywords.json", file=sys.stderr)
    return 1 if (problems and "--strict" in sys.argv) else 0


if __name__ == "__main__":
    sys.exit(main())

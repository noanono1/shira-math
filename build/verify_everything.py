#!/usr/bin/env python3
"""Exhaustive Playwright verification of Shira's world.

Pass A — programmatic asserts on every page:
  console/page errors · every <img> loads · katex-error==0 · every internal
  href resolves on disk · every q-input accepts its data-answer and rejects a
  wrong one · every marks-btn toggles · all-sols opens every details.sol ·
  progress checkboxes persist across reload · every <details> can open.

Pass B — visual evidence: an element screenshot of EVERY visual block
  (svg figures, image figures, formula boxes, display math, dot rows, stacks,
  data tables, video thumbs), montaged into one contact sheet per page for
  human review under build/shots/verify/.

Usage: .venv/bin/python outputs/SHIRA__math/build/verify_everything.py
"""
import asyncio, os, re, sys, urllib.parse

from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "shots", "verify")
os.makedirs(OUT, exist_ok=True)

import glob as _glob
PAGES = (["index.html", "library.html"]
         + sorted(os.path.relpath(p, ROOT) for p in _glob.glob(os.path.join(ROOT, "statistics", "*.html")))
         + sorted(os.path.relpath(p, ROOT) for p in _glob.glob(os.path.join(ROOT, "algebra", "*.html")))
         + sorted(os.path.relpath(p, ROOT) for p in _glob.glob(os.path.join(ROOT, "geometry", "*.html"))))

VISUAL_SEL = ("figure svg, figure img, .fbox, .dotrow, .stacks, table.dtable, "
              ".video-link img, .katex-display")

problems = []


def note(page, msg):
    problems.append(f"{page}: {msg}")


_MATH_RE = re.compile(r"\$\$(.+?)\$\$|\\\((.+?)\\\)|\\\[(.+?)\\\]", re.S)


def math_runs(path):
    """כל קטע מתמטיקה בקובץ, כפי שנכתב במקור (לפני KaTeX)."""
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    for m in _MATH_RE.finditer(src):
        expr = next(g for g in m.groups() if g is not None)
        yield expr.strip().replace("\n", " ")[:60], expr


async def check_page(browser, rel):
    path = os.path.join(ROOT, rel)
    page = await browser.new_page(viewport={"width": 1000, "height": 1200},
                                  device_scale_factor=2)
    errs = []
    page.on("console", lambda m: errs.append(m.text[:120]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(str(e)[:150]))
    await page.goto("file://" + path, wait_until="domcontentloaded", timeout=20000)
    await page.evaluate("""() => Promise.all([...document.images].map(i => {
        if (i.loading === 'lazy') i.loading = 'eager';
        return (i.complete && i.naturalWidth > 0) ? 0
            : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 5000); });
    }))""")
    await page.wait_for_timeout(1100)

    # --- Pass A: asserts ---
    bad_imgs = await page.evaluate("""() => [...document.images]
        .filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src'))""")
    for b in bad_imgs:
        note(rel, f"broken img {b}")
    kerr = await page.evaluate("() => document.querySelectorAll('.katex-error').length")
    if kerr:
        note(rel, f"{kerr} katex-error")

    # KaTeX happily renders nonsense when a brace lands in the wrong place
    # (a stray {2} became a factor and the gate stayed green) — so check the
    # source of every math run for balanced braces, independently of KaTeX.
    for label, expr in math_runs(path):
        depth = 0
        for i, ch in enumerate(expr):
            if ch == "{" and (i == 0 or expr[i - 1] != "\\"):
                depth += 1
            elif ch == "}" and (i == 0 or expr[i - 1] != "\\"):
                depth -= 1
                if depth < 0:
                    break
        if depth != 0:
            note(rel, f"unbalanced braces in math: {label}")

    hrefs = await page.evaluate("""() => [...document.querySelectorAll('a[href]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && !h.startsWith('http') && !h.startsWith('#') && !h.startsWith('data:'))""")
    base = os.path.dirname(path)
    for h in set(hrefs):
        target = urllib.parse.unquote(h.split("#")[0])
        if target and not os.path.exists(os.path.normpath(os.path.join(base, target))):
            note(rel, f"dead link {h}")

    # q-inputs: correct answer -> ok, wrong -> no
    qn = await page.evaluate("() => document.querySelectorAll('.q-input[data-answer]').length")
    for i in range(qn):
        ok = await page.evaluate(f"""() => {{
            const rows = [...document.querySelectorAll('.q-row')].filter(r => r.querySelector('.q-input[data-answer]'));
            const row = rows[{i}]; if (!row) return 'norow';
            const inp = row.querySelector('.q-input'), btn = row.querySelector('.q-check'),
                  fb = row.querySelector('.q-feedback');
            if (!btn || !fb) return 'missing-controls';
            inp.value = inp.dataset.answer; btn.click();
            const good = fb.classList.contains('ok');
            inp.value = '123456'; btn.click();
            const bad = fb.classList.contains('no');
            return (good && bad) ? 'ok' : ('good=' + good + ',bad=' + bad);
        }}""")
        if ok != "ok":
            note(rel, f"q-input #{i + 1} misbehaves ({ok})")

    # marks buttons toggle
    mb = await page.evaluate("""() => {
        let fail = 0;
        document.querySelectorAll('.marks-btn').forEach(b => {
            const ex = b.closest('.ex'); if (!ex) { fail++; return; }
            const before = ex.classList.contains('hide-marks'); b.click();
            if (ex.classList.contains('hide-marks') === before) fail++;
            b.click();
        });
        return fail;
    }""")
    if mb:
        note(rel, f"{mb} marks-btn do not toggle")

    # all-sols button opens all details.sol
    asol = await page.evaluate("""() => {
        const btn = document.querySelector('.all-sols');
        if (!btn) return 'none';
        btn.click();
        const closed = [...document.querySelectorAll('details.sol')].filter(d => !d.open).length;
        btn.click();
        return closed === 0 ? 'ok' : closed + ' still closed';
    }""")
    if asol not in ("ok", "none"):
        note(rel, f"all-sols: {asol}")

    # progress persistence (only on pages with checkboxes)
    nboxes = await page.evaluate("() => document.querySelectorAll('.mark input[data-k]').length")
    if nboxes:
        await page.evaluate("() => { const b = document.querySelector('.mark input[data-k]'); b.click(); }")
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(900)
        checked = await page.evaluate("() => document.querySelector('.mark input[data-k]').checked")
        if not checked:
            note(rel, "progress checkbox does not persist across reload")
        await page.evaluate("() => localStorage.clear()")

    if errs:
        note(rel, "console: " + "; ".join(errs[:3]))

    # --- Pass B: element screenshots (details opened so nothing hides) ---
    await page.evaluate("() => document.querySelectorAll('details').forEach(d => d.open = true)")
    await page.wait_for_timeout(250)
    els = await page.query_selector_all(VISUAL_SEL)
    shots = []
    slug = rel.replace(os.sep, "_").replace(".html", "")
    for i, el in enumerate(els):
        try:
            box = await el.bounding_box()
            if not box or box["width"] < 30 or box["height"] < 18:
                continue
            fp = os.path.join(OUT, f"{slug}_{i:03d}.png")
            await el.screenshot(path=fp)
            shots.append(fp)
        except Exception:
            continue
    await page.close()
    return shots


def montage(slug, files):
    if not files:
        return None
    ims = []
    for f in files:
        im = Image.open(f)
        im.thumbnail((820, 820))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 40, 20], fill="black")
        d.text((4, 4), f"{files.index(f) + 1}", fill="yellow")
        ims.append(im)
    w = max(i.width for i in ims) + 16
    h = sum(i.height + 14 for i in ims) + 8
    sheet = Image.new("RGB", (w, h), "#EEE")
    y = 8
    for im in ims:
        sheet.paste(im, (8, y))
        y += im.height + 14
    out = os.path.join(OUT, f"SHEET_{slug}.png")
    sheet.save(out, quality=80)
    for f in files:
        os.remove(f)
    return out


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        sheets = []
        for rel in PAGES:
            print("verifying:", rel, flush=True)
            shots = await check_page(browser, rel)
            s = montage(rel.replace(os.sep, "_").replace(".html", ""), shots)
            if s:
                sheets.append(os.path.basename(s))
        await browser.close()
    print("\n--- PROBLEMS ---" if problems else "\n--- NO PROBLEMS ---")
    for pr in problems:
        print(" ✗", pr)
    print("\nsheets for visual review →", OUT)
    for s in sheets:
        print("  ", s)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    asyncio.run(main())

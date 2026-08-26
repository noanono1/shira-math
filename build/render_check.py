#!/usr/bin/env python3
"""Render every page of Shira's world with headless Chromium and report:
  - console errors / page errors
  - <img> that failed to load
  - KaTeX: rendered count, .katex-error count, leftover raw $...$
  - saves a full-page screenshot (device_scale_factor=2) per page to build/shots/
  - for statistics pages: also a print-media PDF with all <details> forced open
Usage: .venv/bin/python outputs/SHIRA__math/build/render_check.py [--no-pdf]
"""
import asyncio, glob, json, os, sys

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "build", "shots")
os.makedirs(SHOTS, exist_ok=True)
MAKE_PDF = "--no-pdf" not in sys.argv

PAGES = ([os.path.join(ROOT, "index.html")]
         + sorted(glob.glob(os.path.join(ROOT, "statistics", "*.html")))
         + sorted(glob.glob(os.path.join(ROOT, "algebra", "*.html")))
         + sorted(glob.glob(os.path.join(ROOT, "geometry", "*.html"))))


async def check(page, path):
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto("file://" + path, wait_until="domcontentloaded", timeout=20000)
    # loading="lazy" images below the fold never load without scrolling — force them,
    # and cap the wait per image so a stuck one can't hang the whole check
    await page.evaluate("""() => Promise.all([...document.images].map(i => {
        if (i.loading === 'lazy') i.loading = 'eager';
        return (i.complete && i.naturalWidth > 0) ? 0
            : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 5000); });
    }))""")
    await page.wait_for_timeout(900)  # KaTeX auto-render
    bad_imgs = await page.evaluate("""() => [...document.images]
        .filter(i => !i.complete || i.naturalWidth === 0)
        .map(i => i.getAttribute('src'))""")
    katex = await page.evaluate("() => document.querySelectorAll('.katex').length")
    kerr = await page.evaluate("() => document.querySelectorAll('.katex-error').length")
    leftover = await page.evaluate(r"""() => {
        const t = document.body.innerText;
        const m = t.match(/\$[^$\n]{2,}\$/g);
        return m ? m.length : 0;
    }""")
    rel = os.path.relpath(path, ROOT)
    name = rel.replace(os.sep, "_").replace(".html", "")
    await page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=True)
    if MAKE_PDF and os.sep.join(["statistics", ""])[:-1] in rel.split(os.sep):
        await page.evaluate("() => document.querySelectorAll('details').forEach(d => d.open = true)")
        await page.emulate_media(media="print")
        await page.pdf(path=os.path.join(SHOTS, name + ".print.pdf"), format="A4",
                       print_background=True)
        await page.emulate_media(media="screen")
    return {"page": rel, "errors": errors, "bad_imgs": bad_imgs,
            "katex": katex, "katex_errors": kerr, "leftover_dollar": leftover}


async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for path in PAGES:
            if not os.path.exists(path):
                continue
            print("checking:", os.path.relpath(path, ROOT), flush=True)
            page = await browser.new_page(viewport={"width": 1000, "height": 1200},
                                          device_scale_factor=2)
            try:
                results.append(await check(page, path))
            except Exception as e:  # noqa: BLE001
                results.append({"page": os.path.relpath(path, ROOT),
                                "errors": [f"RENDER FAIL: {e}"], "bad_imgs": [],
                                "katex": 0, "katex_errors": 0, "leftover_dollar": 0})
            await page.close()
        await browser.close()
    print(f"{'page':44s} {'katex':>6} {'kerr':>5} {'$left':>6} {'badImg':>7} errors")
    ok = True
    for r in results:
        bad = r["errors"] or r["bad_imgs"] or r["katex_errors"] or r["leftover_dollar"]
        if bad:
            ok = False
        print(f"{r['page']:44s} {r['katex']:>6} {r['katex_errors']:>5} "
              f"{r['leftover_dollar']:>6} {len(r['bad_imgs']):>7} "
              f"{'**' if bad else 'OK'} {'; '.join(r['errors'][:3])[:80]}")
        for b in r["bad_imgs"][:8]:
            print(f"      broken-img: {b}")
    json.dump(results, open(os.path.join(ROOT, "build", "render_report.json"), "w"),
              ensure_ascii=False, indent=2)
    print("\nscreenshots →", SHOTS)
    print("ALL CLEAN" if ok else "ISSUES FOUND (see above)")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())

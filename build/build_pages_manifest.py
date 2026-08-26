import glob, json, os
# נתיב מוחלט לפי מיקום הקובץ — deploy.sh רץ מתיקיות שונות
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pages=sorted(os.path.relpath(p,ROOT) for p in
             glob.glob(ROOT+"/*.html")+glob.glob(ROOT+"/*/*.html") if "/build/" not in p)
extra=["css/shira.css","js/shira.js","vendor/katex.min.css","vendor/katex.min.js",
       "vendor/contrib/auto-render.min.js","assets/search-index.js",
       "assets/icons/icon-180.png","manifest.webmanifest"]
fonts=sorted(os.path.relpath(f,ROOT) for f in glob.glob(ROOT+"/vendor/fonts/*.woff2"))
out={"pages":pages,"assets":extra+fonts}
json.dump(out, open(ROOT+"/assets/pages.json","w",encoding="utf-8"), ensure_ascii=False, indent=0)
print("pages.json:", len(pages), "pages +", len(out["assets"]), "assets")

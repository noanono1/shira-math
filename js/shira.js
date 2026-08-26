/* ============================================================================
   העולם של שירה · התנהגויות משותפות (vanilla, progressive enhancement)
   הכל עובד גם בלי JS: פתרונות ב-<details> נפתחים בלחיצה, התשובות תמיד בפנים.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 1. KaTeX auto-render ---------- */
  /* ל-KaTeX אין מטריקות לאותיות עבריות, ולכן תיבת \text עברית טהורה מקבלת גובה 0 —
     והתווית נדפסת בתוך הסוגר המסולסל שמעליה. \vphantom{Ay} (רוחב אפס) מחזיר לתיבה
     גובה ועומק אמיתיים. תוויות שיש בהן ספרה או אות לטינית תקינות ממילא. */
  var HEB_TEXT = /\\text\{([^{}]*[֐-׿][^{}]*)\}/g;
  function fixHebrewMetrics(tex) {
    return tex.replace(HEB_TEXT, function (m, inner) {
      return '\\text{' + inner + '}\\vphantom{Ay}';
    });
  }

  function initMath() {
    if (typeof renderMathInElement !== 'function') return;
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      preProcess: fixHebrewMetrics,
      throwOnError: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']
    });
  }

  /* ---------- 1ב. נוסחה רחבה מתכווצת כדי להיכנס למסך ----------
     במסך צר נוסחה ארוכה נחתכה בלי שום סימן שאפשר להחליק אותה — וחצי מהשורה
     (למשל ההערה האדומה על הפעולה) פשוט נעלמה. כאן מקטינים אותה עד שהיא נכנסת. */
  function fitMath() {
    document.querySelectorAll('.katex-display').forEach(function (block) {
      var inner = block.firstElementChild;
      if (!inner) return;
      inner.style.fontSize = '';
      var avail = block.clientWidth;
      if (!avail || block.scrollWidth <= avail + 1) return;
      /* המכל הוא שיודע כמה רוחב באמת חסר — הילד עצמו נצמד לרוחב המכל */
      /* מקטינים רק עד גבול הקריאוּת — מה שעדיין רחב מזה מקבל שלט "אפשר להחליק" */
      var ratio = Math.max(avail / block.scrollWidth, 0.72);
      inner.style.fontSize = (ratio * 100).toFixed(1) + '%';
      if (block.scrollWidth > avail + 1) {   /* פס שני מתקן עיגול */
        ratio = Math.max(ratio * avail / block.scrollWidth, 0.72);
        inner.style.fontSize = (ratio * 100).toFixed(1) + '%';
      }
    });
  }

  /* ---------- 1ג. "אפשר להחליק הצידה" ----------
     טבלה או נוסחה שרחבה מהמסך מחליקה בתוך עצמה — בלי שלט העמודות שמעבר לקצה
     פשוט נעלמות בשקט, והיא עונה לפי חצי טבלה. השלט נשתל אחרי האלמנט, לא בתוכו,
     כדי שלא יגלול איתו. */
  function markScrollables() {
    document.querySelectorAll('table.dtable, .katex-display').forEach(function (el) {
      var scrollable = el.scrollWidth > el.clientWidth + 2;
      var hint = el.nextElementSibling;
      var has = hint && hint.classList && hint.classList.contains('scroll-hint');
      if (scrollable && !has) {
        var d = document.createElement('div');
        d.className = 'scroll-hint';
        d.textContent = el.tagName === 'TABLE'
          ? '⇠ אפשר להחליק את הטבלה הצידה — יש בה עוד עמודות'
          : '⇠ אפשר להחליק את השורה הצידה כדי לראות את המשך החישוב';
        el.parentNode.insertBefore(d, el.nextSibling);
      } else if (!scrollable && has) {
        hint.parentNode.removeChild(hint);
      }
    });
  }

  function refit() { fitMath(); markScrollables(); }

  function initMathFit() {
    refit();
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(refit, 150);
    });
    /* פתרון שנפתח מודד לראשונה רק ברגע הפתיחה */
    document.querySelectorAll('details').forEach(function (d) {
      d.addEventListener('toggle', function () { if (d.open) refit(); });
    });
  }

  /* ---------- 2. פתח/סגור את כל הפתרונות ---------- */
  function initAllSols() {
    document.querySelectorAll('.all-sols').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sols = document.querySelectorAll('details.sol');
        var anyClosed = Array.prototype.some.call(sols, function (d) { return !d.open; });
        sols.forEach(function (d) { d.open = anyClosed; });
        btn.textContent = anyClosed ? 'לסגור את כל הפתרונות' : 'לפתוח את כל הפתרונות';
      });
    });
  }

  /* ---------- 3. התקדמות (localStorage) ----------
     מפתח: shira:<page>  (page מגיע מ-body[data-page], למשל stat:02-mean)
     ערך: {"done":{k:true,...},"total":N} — המפות והמרכז קוראים את זה.

     כלל הסך-הכל (total): יחידת התקדמות אחת = עדוּת אחת שהיא עבדה.
     יש בדף שני סוגי עדוּת, והם נספרים יחד ולעולם לא זה במקום זה:
       · תיבת סימון ידנית  (.mark input[data-k])  → המפתח הוא data-k
       · בדיקה עצמית מספרית (.q-input[data-answer]) → המפתח הוא "q:<מספר סידורי>"
     total = מספר התיבות + מספר הבדיקות העצמיות. שני מרחבי-מפתחות זרים, ולכן
     שום תשובה נכונה לא "מסמנת" תיבה שהיא לא סימנה — ותיבה שהיא מבטלת נשארת
     מבוטלת. בכל טעינה נמחקים מפתחות שאין להם יותר עוגן בדף, כך ש-done לעולם
     אינו גדול מ-total. דף בלי תיבות ובלי בדיקות עצמיות לא כותב כלום. */
  var PAGE = document.body.getAttribute('data-page') || '';
  var KEY = 'shira:' + PAGE;

  /* נקבע ב-initProgress; מוחזר true רק בפעם הראשונה שבדיקה עצמית מזוכה */
  var creditQuestion = null;

  function saveProgress(doneMap, total) {
    try { localStorage.setItem(KEY, JSON.stringify({ done: doneMap, total: total })); }
    catch (e) { /* private mode — לא נורא */ }
  }
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}').done || {}; }
    catch (e) { return {}; }
  }

  function initProgress() {
    if (!PAGE) return;
    var boxes = Array.prototype.slice.call(document.querySelectorAll('.mark input[data-k]'));
    var qs = Array.prototype.slice.call(document.querySelectorAll('.q-input[data-answer]'));
    var total = boxes.length + qs.length;
    if (!total) return;

    var keyOfInput = new Map();
    var valid = {};
    boxes.forEach(function (b) { valid[b.dataset.k] = true; });
    qs.forEach(function (inp, i) {
      var k = 'q:' + (i + 1);
      valid[k] = true;
      keyOfInput.set(inp, k);
    });

    var done = loadProgress();
    /* ניקוי: מפתחות משמורת ישנה שאין להם יותר עוגן בדף לא ייספרו */
    Object.keys(done).forEach(function (k) { if (!valid[k]) delete done[k]; });

    function paint() {
      var n = 0;
      Object.keys(done).forEach(function (k) { if (valid[k]) n++; });
      boxes.forEach(function (b) { if (done[b.dataset.k]) b.checked = true; });
      var bar = document.querySelector('.progressbar i');
      if (bar) bar.style.width = Math.round(100 * n / total) + '%';
      var lbl = document.querySelector('.progress-label');
      if (lbl) lbl.textContent = n + ' מתוך ' + total;
    }

    boxes.forEach(function (b) {
      b.addEventListener('change', function () {
        if (b.checked) done[b.dataset.k] = true; else delete done[b.dataset.k];
        saveProgress(done, total);
        paint();
      });
    });

    /* התקדמות שממלאת את עצמה: תשובה נכונה בבדיקה עצמית נרשמת לבד */
    creditQuestion = function (input) {
      var k = keyOfInput.get(input);
      if (!k || done[k]) return false;
      done[k] = true;
      saveProgress(done, total);
      paint();
      return true;
    };

    paint();
    saveProgress(done, total);
  }

  /* ---------- 4. בדיקה עצמית מספרית ---------- */
  function initSelfCheck() {
    document.querySelectorAll('.q-row').forEach(function (row) {
      var input = row.querySelector('.q-input[data-answer]');
      var btn = row.querySelector('.q-check');
      var fb = row.querySelector('.q-feedback');
      if (!input || !btn || !fb) return;
      var fails = 0;
      function check() {
        var raw = (input.value || '').replace(',', '.').trim();
        var val = parseFloat(raw);
        var ans = parseFloat(input.dataset.answer);
        var tol = parseFloat(input.dataset.tol || '0.001');
        if (raw === '' || isNaN(val)) { fb.textContent = 'כתבי מספר ואז בדקי'; fb.className = 'q-feedback'; return; }
        if (Math.abs(val - ans) <= tol) {
          fb.textContent = 'נכון! ✓'; fb.className = 'q-feedback ok'; fails = 0;
          if (creditQuestion && creditQuestion(input)) {
            fb.textContent = 'נכון! ✓ · נרשם בהתקדמות';
          }
        } else {
          fails++;
          var hint = '';
          var ex = row.closest('.ex');
          if (fails >= 2 && ex && ex.querySelector('.marks-btn')) {
            hint = ' (רמז: כפתור "הציגי את הפירוק בצבעים" למעלה עוזר)';
          }
          fb.textContent = 'עוד לא — נסי שוב, או פתחי את הפתרון' + hint;
          fb.className = 'q-feedback no';
        }
      }
      btn.addEventListener('click', check);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
    });
  }

  /* ---------- 5. "הציגי את הפירוק בצבעים" (רמז 1 בתרגילי שלב 2) ---------- */
  function initMarksToggle() {
    document.querySelectorAll('.marks-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ex = btn.closest('.ex');
        if (!ex) return;
        var hidden = ex.classList.toggle('hide-marks');
        btn.textContent = hidden ? 'הציגי את הפירוק בצבעים' : 'הסתירי את הפירוק';
      });
    });
  }

  /* ---------- 6. הדפסה: כפתור + פתיחת כל ה-details לפני הדפסה ---------- */
  var reclose = [];
  function openAllForPrint() {
    reclose = [];
    document.querySelectorAll('details:not([open])').forEach(function (d) {
      reclose.push(d); d.open = true;
    });
  }
  function recloseAfterPrint() {
    reclose.forEach(function (d) { d.open = false; });
    reclose = [];
  }
  function initPrint() {
    /* רק בדפים שמצהירים data-page (תחנות ומפות). המרכז והספרייה אינם דפים
       להדפסה, ואם יטענו את הקובץ הזה — שלא יצמח להם כפתור הדפסה בסרגל. */
    var bar = PAGE ? document.querySelector('.topbar-in') : null;
    if (bar) {
      var btn = document.createElement('button');
      btn.textContent = '⎙ הדפסה / PDF';
      btn.className = 'no-print';
      btn.setAttribute('style',
        'font-family:inherit;font-size:12px;font-weight:700;color:var(--soft);' +
        'background:transparent;border:1px solid var(--line);border-radius:7px;' +
        'padding:4px 10px;cursor:pointer');
      btn.addEventListener('click', function () { window.print(); });
      bar.appendChild(btn);
    }
    window.addEventListener('beforeprint', openAllForPrint);
    window.addEventListener('afterprint', recloseAfterPrint);
  }

  /* ---------- 7. "לא הבנתי" — סימון קטע שנתקעה בו ----------
     עד היום, כשהיא לא הבינה משהו היא נשארה איתו לבד. כאן היא מסמנת את הקטע
     עצמו, והסימון מחכה לה במרכז (index.html) עם קישור בחזרה בדיוק לאותה כותרת.

     איפה הכפתור מופיע: רק בדפי לימוד — כלומר body[data-page] קיים ואינו נגמר
     ב-":index". זה מוציא החוצה את המרכז ואת הספרייה (אין להם data-page בכלל)
     ואת שלוש המפות (stat:index / alg:index / geo:index). בתוך דף לימוד הכפתור
     נשתל בראש כל <h2> שבתוך <main> — כותרת h2 היא היחידה שהאתר מחלק אליה
     קטעים (אין באתר אלמנטי <section>). בדף לימוד בלי h2 בכלל (בחני הבית)
     נשתל סימון אחד לכל הדף מתחת לכותרת.

     אחסון: מפתח יחיד shira:asks — מערך של
       {page, path, title, sectionTitle, anchor, ts}
     page = data-page (הזהות), path = הנתיב יחסית לשורש האתר ("statistics/02-mean.html",
     נגזר מ-location ולכן עובד גם ב-file:// וגם ב-GitHub Pages), anchor = ה-id של
     הכותרת (נוצר כאן אם אין), ts = חותמת זמן. הזהות לצורך כפילות/ביטול היא
     page + "#" + anchor. */
  var ASKS_KEY = 'shira:asks';

  function loadAsks() {
    try {
      var a = JSON.parse(localStorage.getItem(ASKS_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveAsks(list) {
    try { localStorage.setItem(ASKS_KEY, JSON.stringify(list)); }
    catch (e) { /* private mode */ }
  }
  function askId(page, anchor) { return page + '#' + (anchor || ''); }

  function isStudyPage() { return !!PAGE && !/(^|:)index$/.test(PAGE); }

  /* "statistics/02-mean.html" — שתי המדרגות האחרונות של הנתיב, כך שהקישור
     מהמרכז (שיושב בשורש) תקין גם מקומית וגם באתר החי. */
  function pagePath() {
    var parts = location.pathname.split('/').filter(function (s) { return s; });
    var file = parts.pop() || 'index.html';
    var dir = parts.pop() || '';
    return dir ? dir + '/' + file : file;
  }
  function pageTitle() {
    var h1 = document.querySelector('header.hero h1');
    return (h1 ? h1.textContent : document.title).replace(/\s+/g, ' ').trim();
  }
  function headingText(h) {
    var c = h.cloneNode(true);
    c.querySelectorAll('.num, .ask-btn').forEach(function (e) { e.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  var toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'ask-toast no-print';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }

  function paintAskBtn(btn, on) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'סומן ✓' : 'לא הבנתי';
    btn.setAttribute('aria-label', on
      ? 'להסיר את הסימון "לא הבנתי" מהקטע הזה'
      : 'לסמן שלא הבנת את הקטע הזה');
    btn.title = on
      ? 'מסומן — מחכה לך במרכז. לחיצה נוספת מסירה את הסימון.'
      : 'לסמן את הקטע הזה כ"לא הבנתי" — הוא יחכה לך במרכז';
  }

  function makeAskBtn(anchor, sectionTitle) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ask-btn no-print';
    paintAskBtn(btn, false);
    btn.addEventListener('click', function () {
      var list = loadAsks();
      var id = askId(PAGE, anchor);
      var at = -1;
      list.forEach(function (it, i) { if (askId(it.page, it.anchor) === id) at = i; });
      if (at > -1) {
        list.splice(at, 1);
        saveAsks(list);
        paintAskBtn(btn, false);
        toast('הסרתי את הסימון.');
      } else {
        list.push({
          page: PAGE,
          path: pagePath(),
          title: pageTitle(),
          sectionTitle: sectionTitle,
          anchor: anchor,
          ts: Date.now()
        });
        saveAsks(list);
        paintAskBtn(btn, true);
        toast('סימנתי. זה מחכה לך במרכז, תחת "מה שלא הבנתי".');
      }
    });
    return btn;
  }

  function initAsk() {
    if (!isStudyPage()) return;
    var main = document.querySelector('main') || document.body;
    var heads = Array.prototype.slice.call(main.querySelectorAll('h2'));
    var saved = {};
    loadAsks().forEach(function (it) { saved[askId(it.page, it.anchor)] = true; });

    if (heads.length) {
      heads.forEach(function (h, i) {
        var titleText = headingText(h);      /* לפני KaTeX ולפני השתילה */
        if (!h.id) {
          var id = 'sec-' + (i + 1), n = 1;
          while (document.getElementById(id)) { id = 'sec-' + (i + 1) + '-' + (++n); }
          h.id = id;
        }
        var btn = makeAskBtn(h.id, titleText);
        if (saved[askId(PAGE, h.id)]) paintAskBtn(btn, true);
        /* ראשון בסדר המקור — כך הצף יושב על השורה הראשונה של הכותרת */
        h.insertBefore(btn, h.firstChild);
      });
    } else {
      /* בוחן הבית: אין h2, ולכן סימון אחד לכל הדף */
      var row = document.createElement('div');
      row.className = 'ask-page no-print';
      var b = makeAskBtn('', pageTitle());
      if (saved[askId(PAGE, '')]) paintAskBtn(b, true);
      row.appendChild(b);
      var hero = document.querySelector('header.hero');
      if (hero && hero.parentNode) hero.parentNode.insertBefore(row, hero.nextSibling);
      else main.insertBefore(row, main.firstChild);
    }
  }

  /* עוגן שנוצר רק עכשיו: הדפדפן כבר ויתר על ה-#hash לפני שה-id היה קיים,
     ובנוסף KaTeX מזיז את הפריסה אחרי הטעינה — לכן גוללים שוב בעצמנו. */
  function honourHash() {
    if (!location.hash || location.hash.length < 2) return;
    var el = null;
    try { el = document.querySelector(location.hash); } catch (e) { return; }
    if (!el) return;
    setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 320);
  }

  /* ---------- 8. הרשימה במרכז (index.html · <section id="ask-noa">) ----------
     המרכז מחזיק שלד ריק משלו — <section id="ask-noa" hidden> עם כותרת
     ו-<div id="ask-noa-list" class="shelf"> — ומצפה שהקובץ הזה ימלא אותו.
     אם השלד קיים ממלאים רק את הרשימה ולא נוגעים בכותרת של המרכז; אם לא,
     בונים כאן גם כותרת. המרכז נושא עיצוב משלו ואינו טוען את css/shira.css,
     ולכן כשהגיליון לא נטען הבלוק מביא איתו גרסה מוקטנת של הכללים. */
  var ASK_FALLBACK_CSS = [
    '#ask-noa .ask-head{margin:36px 0 12px;display:flex;align-items:baseline;gap:12px}',
    '#ask-noa .ask-head h3{margin:0;font-size:15px;font-weight:800;white-space:nowrap;color:var(--soft,#5A6875)}',
    '#ask-noa .ask-head .bar{flex:1;height:1px;background:var(--line,#E9E4DA)}',
    '.ask-list{background:var(--card,#fff);border:1px solid var(--line,#E9E4DA);border-radius:12px;padding:2px 18px}',
    '.ask-item{display:flex;align-items:baseline;gap:10px;padding:10px 2px;border-bottom:1px dashed var(--faint,#EFEAE0)}',
    '.ask-item:last-child{border-bottom:none}',
    '.ask-list .ask-item>a{display:inline;padding:0;min-height:0;border-bottom:none;',
    'text-decoration:none;color:inherit;font-size:13.5px;min-width:0}',
    '.ask-item>a b{font-weight:700}',
    '.ask-item .ask-where{color:var(--soft,#5A6875);font-size:12px;margin-inline-start:6px}',
    '.ask-del{margin-inline-start:auto;flex:0 0 auto;font-family:inherit;font-size:11.5px;',
    'color:var(--soft,#5A6875);background:transparent;border:1px dashed var(--line,#E9E4DA);',
    'border-radius:99px;padding:3px 10px;cursor:pointer}',
    '.ask-del:hover{color:var(--ink,#1C2733);border-color:#D8D1C4;background:#FBFAF7}',
    '.ask-note{margin:8px 2px 0;font-size:12px;color:var(--soft,#5A6875)}'
  ].join('');

  function ensureAskStyles() {
    if (document.querySelector('link[href*="shira.css"]')) return;
    if (document.getElementById('ask-fallback-css')) return;
    var st = document.createElement('style');
    st.id = 'ask-fallback-css';
    st.textContent = ASK_FALLBACK_CSS;
    document.head.appendChild(st);
  }

  function initAskHub() {
    var host = document.getElementById('ask-noa');
    if (!host) return;
    var shell = document.getElementById('ask-noa-list');   /* השלד של המרכז, אם יש */

    function render() {
      var list = loadAsks();
      var note = host.querySelector('.ask-note');
      if (note) note.remove();
      if (shell) shell.textContent = ''; else host.textContent = '';
      if (!list.length) { host.hidden = true; return; }
      ensureAskStyles();

      var box = shell;
      if (!box) {
        var head = document.createElement('div');
        head.className = 'ask-head';
        var h3 = document.createElement('h3');
        h3.textContent = '❓ לשאול את נועה';
        var bar = document.createElement('div');
        bar.className = 'bar';
        head.appendChild(h3);
        head.appendChild(bar);
        host.appendChild(head);
        box = document.createElement('div');
        host.appendChild(box);
      }
      box.classList.add('ask-list');

      list.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })
        .forEach(function (it) {
          var item = document.createElement('div');
          item.className = 'ask-item';

          var a = document.createElement('a');
          var target = it.path || '';
          if (it.anchor) target = target + '#' + it.anchor;
          a.setAttribute('href', target);
          var b = document.createElement('b');
          b.textContent = it.sectionTitle || it.title || 'קטע מסומן';
          a.appendChild(b);
          if (it.title && it.title !== it.sectionTitle) {
            var where = document.createElement('span');
            where.className = 'ask-where';
            where.textContent = '· ' + it.title;
            a.appendChild(where);
          }
          item.appendChild(a);

          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'ask-del';
          del.textContent = 'הבנתי — למחוק';
          del.setAttribute('aria-label', 'למחוק את "' + (it.sectionTitle || it.title || '') + '" מהרשימה');
          del.addEventListener('click', function () {
            var id = askId(it.page, it.anchor);
            saveAsks(loadAsks().filter(function (x) { return askId(x.page, x.anchor) !== id; }));
            render();
          });
          item.appendChild(del);

          box.appendChild(item);
        });

      if (box.parentNode !== host) host.appendChild(box);

      var hint = document.createElement('p');
      hint.className = 'ask-note';
      hint.textContent = 'לחיצה מחזירה אותך בדיוק לקטע שסימנת. אחרי שהבנת — למחוק.';
      host.appendChild(hint);

      host.hidden = false;
    }

    render();
  }

  /* ---------- 8. שיהיה זמין גם בלי רשת ----------
     האתר נשמר במכשיר אחרי הביקור הראשון, כך שאפשר ללמוד גם באוטובוס או
     במקום בלי קליטה. דף תמיד נמשך קודם מהרשת, ולכן גרסה חדשה מגיעה מיד —
     המטמון הוא רשת ביטחון בלבד. (עובד רק ב-https, לא בפתיחת קובץ מהמחשב.) */
  function initOffline() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;   /* https או localhost בלבד */
    /* שורש האתר נגזר מה-manifest שכל דף מצביע אליו ממילא ('manifest.webmanifest'
       בשורש, '../manifest.webmanifest' בתת-תיקייה) — כך זה נכון בכל עומק,
       ולא נשבר כשנוספת תיקיית תוכן חדשה. */
    var man = document.querySelector('link[rel="manifest"]');
    var base;
    try {
      base = new URL('.', (man && man.href) ? man.href : location.href).pathname;
    } catch (e) {
      base = location.pathname.replace(/[^/]*$/, '');
    }
    navigator.serviceWorker.register(base + 'sw.js', { scope: base })
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) {
        /* אחרי שהדף כבר מוצג, מבקשים בשקט לשמור את שאר האתר במכשיר */
        var warm = function () {
          if (reg.active) reg.active.postMessage({ type: 'warm' });
        };
        if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 6000 });
        else setTimeout(warm, 4000);
      })
      .catch(function () { /* בלי המנגנון הזה האתר עדיין עובד רגיל */ });
  }


  /* ---------------------------------------------------------------
     "בונים ביחד במחברת" — פתרון שנבנה שלב-אחרי-שלב, כמו מורה שממלאת
     מחברת על הלוח. בלי JS כל השלבים פשוט גלויים, ולכן ההסתרה נעשית
     מכאן ולא מה-HTML: מי שאין לו סקריפט עדיין מקבל את הפתרון המלא.
     --------------------------------------------------------------- */
  function initNotebook() {
    document.querySelectorAll('.nb[data-nb]').forEach(function (nb) {
      var steps = Array.prototype.slice.call(nb.querySelectorAll('.nb-step'));
      if (steps.length < 2) return;
      var count = nb.querySelector('.nb-count');
      var next = nb.querySelector('.nb-next');
      var all = nb.querySelector('.nb-all');
      var shown = 1;

      steps.forEach(function (s, i) { s.setAttribute('data-n', i + 1); });

      function paint(animate) {
        steps.forEach(function (s, i) {
          var hide = i >= shown;
          s.classList.toggle('is-hidden', hide);
          s.classList.toggle('is-new', animate && i === shown - 1);
        });
        if (count) {
          count.textContent = shown >= steps.length
            ? 'כל ' + steps.length + ' השלבים'
            : 'שלב ' + shown + ' מתוך ' + steps.length;
        }
        if (next) {
          if (shown >= steps.length) {
            next.textContent = 'זהו — הפתרון שלם ✓';
            next.disabled = true;
            next.classList.add('nb-done');
            next.style.background = 'transparent';
            next.style.color = 'var(--c-find)';
            next.style.cursor = 'default';
          } else {
            next.textContent = 'השלב הבא ↓';
          }
        }
        if (all) all.textContent = shown >= steps.length ? 'להתחיל מהתחלה' : 'להציג את כל השלבים';
        if (animate) refit();
      }

      if (next) {
        next.addEventListener('click', function () {
          if (shown >= steps.length) return;
          shown++;
          paint(true);
          steps[shown - 1].scrollIntoView({ block: 'nearest' });
        });
      }
      if (all) {
        all.addEventListener('click', function () {
          shown = shown >= steps.length ? 1 : steps.length;
          paint(true);
        });
      }
      window.addEventListener('beforeprint', function () {
        steps.forEach(function (s) { s.classList.remove('is-hidden'); });
      });
      window.addEventListener('afterprint', function () { paint(false); });
      paint(false);
    });
  }

  /* ---------------------------------------------------------------
     "מה יש בעמוד הזה" — תוכן העניינים של הדף עצמו, נבנה מה-h2/h3.
     הבעיה שהוא פותר: דף ארוך נראה כמו קיר טקסט אחד, והסעיף שחיפשת
     נמצא בו — רק לא ראית אותו. המפה מראה בשורה אחת מה יש כאן, ומסמנת
     איפה את עכשיו.
     --------------------------------------------------------------- */
  function initPageMap() {
    if (!isStudyPage()) return;
    var main = document.querySelector('main');
    if (!main) return;
    var hero = main.querySelector('header.hero');
    if (!hero) return;
    var heads = Array.prototype.slice.call(main.querySelectorAll('h2'));
    if (heads.length < 3) return;

    var box = document.createElement('details');
    box.className = 'pagemap no-print';
    box.id = 'pagemap';
    var sum = document.createElement('summary');
    sum.innerHTML = '<span>מה יש בעמוד הזה</span>' +
      '<span class="pm-n">' + heads.length + ' סעיפים</span>';
    box.appendChild(sum);
    var ol = document.createElement('ol');

    var links = [];
    heads.forEach(function (h, i) {
      if (!h.id) {
        var id = 'sec-' + (i + 1), n = 1;
        while (document.getElementById(id)) { id = 'sec-' + (i + 1) + '-' + (++n); }
        h.id = id;
      }
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = headingText(h);
      li.appendChild(a);
      ol.appendChild(li);
      links.push({ a: a, h: h });
    });
    box.appendChild(ol);
    hero.parentNode.insertBefore(box, hero.nextSibling);

    /* פתוח מלכתחילה במסך רחב (יש מקום), סגור בטלפון (אין) */
    var wide = window.matchMedia('(min-width:1180px)');
    function place() {
      box.classList.toggle('dock', wide.matches);
      box.open = wide.matches;
    }
    place();
    if (wide.addEventListener) wide.addEventListener('change', place);

    /* כפתור צף בטלפון — המפה זמינה גם אחרי שגללת רחוק ממנה */
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'pm-fab no-print';
    fab.textContent = '☰';
    fab.title = 'מה יש בעמוד הזה';
    fab.setAttribute('aria-label', 'לפתוח את מפת העמוד');
    fab.hidden = true;
    fab.addEventListener('click', function () {
      box.open = true;
      box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    document.body.appendChild(fab);
    window.addEventListener('scroll', function () {
      fab.hidden = wide.matches || window.scrollY < 700;
    }, { passive: true });

    /* סימון "איפה אני עכשיו" */
    var current = null;
    function spy() {
      var best = null;
      links.forEach(function (l) {
        if (l.h.getBoundingClientRect().top <= 120) best = l;
      });
      if (best === current) return;
      links.forEach(function (l) { l.a.classList.remove('here'); });
      if (best) best.a.classList.add('here');
      current = best;
    }
    var st;
    window.addEventListener('scroll', function () {
      clearTimeout(st);
      st = setTimeout(spy, 90);
    }, { passive: true });
    spy();

    /* בטלפון: אחרי בחירה מהמפה אין טעם להשאיר אותה פרושה */
    ol.addEventListener('click', function () { if (!wide.matches) box.open = false; });
  }

  function boot() {
    initOffline();
    initAsk();        /* לפני KaTeX: הכותרות עוד נקיות לקריאת שם הקטע */
    initPageMap();    /* גם הוא קורא כותרות — לפני שKaTeX משנה אותן */
    initMath();
    initMathFit();
    initAllSols();
    initProgress();
    initSelfCheck();
    initMarksToggle();
    initNotebook();
    initPrint();
    initAskHub();
    honourHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

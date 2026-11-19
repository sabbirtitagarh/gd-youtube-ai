/* ==========================================================
   GD YouTube AI - main app (UI, routing, state)
   ========================================================== */
(function () {
  'use strict';
  var GD = window.GD;
  var AI = window.GDAI;
  var TH = window.GDThumb;
  var DR = window.GDDrive;
  var O = GD.OWNER;

  var LS_SET = 'gdyt.settings';
  var LS_HIST = 'gdyt.history';
  var MAX_HISTORY = 60;
  var LS_ADMIN = 'gdyt.admin';
  var APP_BUILD = '1.1.2';

  var state = {
    page: 'home',
    settings: loadSettings(),
    history: loadLocalHistory(),
    current: null, // entry
    thumbCanvas: null,
    busy: false,
    deferredInstall: null,
    credits: null
  };

  var copyStore = {};
  var copySeq = 0;

  /* ---------------- utils ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function slug(s) { return AI.clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video'; }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; }
  }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, isErr ? 4500 : 2200);
  }

  function copyText(text, btn) {
    function done() {
      toast('Copy ho gaya ✅');
      if (btn) {
        var old = btn.textContent;
        btn.classList.add('done');
        btn.textContent = 'Copied ✓';
        setTimeout(function () { btn.classList.remove('done'); btn.textContent = old; }, 1500);
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy nahi ho paya', true); }
      document.body.removeChild(ta);
    }
  }
  function reg(text) { var id = 'c' + (++copySeq); copyStore[id] = text; return id; }

  /* ---------------- settings & history storage ---------------- */
  function defaultSettings() {
    var sharedReady = GD.APPS_SCRIPT_URL && !/PASTE_/.test(GD.APPS_SCRIPT_URL);
    return {
      mode: sharedReady ? 'shared' : 'own',
      apiKey: '',
      model: 'gemini-3.5-flash-lite',
      theme: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
      palette: 'ai',
      layout: 'ai',
      mascot: true
    };
  }
  function loadSettings() {
    var d = defaultSettings();
    try {
      var s = JSON.parse(localStorage.getItem(LS_SET));
      if (s && typeof s === 'object') return Object.assign(d, s);
    } catch (e) {}
    return d;
  }
  function saveSettings() { try { localStorage.setItem(LS_SET, JSON.stringify(state.settings)); } catch (e) {} }
  function loadLocalHistory() {
    try { var h = JSON.parse(localStorage.getItem(LS_HIST)); return Array.isArray(h) ? h : []; } catch (e) { return []; }
  }
  function saveLocalHistory() {
    try { localStorage.setItem(LS_HIST, JSON.stringify(state.history.slice(0, MAX_HISTORY))); } catch (e) {}
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    $('#themeBtn').textContent = state.settings.theme === 'dark' ? '☀️' : '🌙';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', state.settings.theme === 'dark' ? '#08122B' : '#0B1F4A');
  }

  /* ---------------- routing ---------------- */
  var PAGES = ['home', 'generate', 'history', 'settings', 'about', 'admin'];
  function go(page, opts) {
    if (PAGES.indexOf(page) < 0) page = 'home';
    state.page = page;
    $all('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + page); });
    $all('.nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-go') === page); });
    if (location.hash !== '#/' + page) { try { history.replaceState(null, '', '#/' + page); } catch (e) {} }
    var renderers = { home: renderHome, generate: renderGenerate, history: renderHistory, settings: renderSettings, about: renderAbout, admin: renderAdmin };
    renderers[page](opts || {});
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ---------------- HOME ---------------- */
  var FEATURES = [
    { ic: '🎯', t: 'SEO Titles', d: '3+ natural, clickable titles + best pick' },
    { ic: '📝', t: 'Description', d: 'Short SEO description with CTA' },
    { ic: '#️⃣', t: 'Hashtags', d: '8-15 topic-specific tags' },
    { ic: '🔑', t: 'SEO Keywords', d: '15-25 keywords, comma separated' },
    { ic: '🖼️', t: 'Thumbnail', d: 'Exact 1280 × 720 px PNG with branding' },
    { ic: '🧠', t: 'Quiz (3 Q)', d: 'Easy, Medium, Tricky + explanations' },
    { ic: '☁️', t: 'Your Drive', d: 'Data sirf aapke Google Drive me', go: 'settings' },
    { ic: '📲', t: 'Install App', d: 'Mobile par app ki tarah install karein', install: true, accent: true }
  ];

  function renderHome() {
    var el = $('#page-home');
    var feats = FEATURES.map(function (f, i) {
      return '<button class="fcard' + (f.accent ? ' accent' : '') + '" data-feat="' + i + '">' +
        '<div class="ic">' + f.ic + '</div><b>' + esc(f.t) + '</b><span>' + esc(f.d) + '</span></button>';
    }).join('');
    el.innerHTML =
      '<div class="card hero"><div class="hero-row"><div style="flex:1">' +
      '<span class="badge">FREE AI • PWA</span>' +
      '<h1>' + esc(GD.APP.tagline) + '</h1>' +
      '<p>' + esc(GD.APP.description) + '</p></div>' +
      '<img src="icons/mascot.png" alt="GD TECH ACADEMY mascot" /></div></div>' +
      '<div class="card"><label class="lbl" for="homeTitle">Video Title</label>' +
      '<input type="text" id="homeTitle" maxlength="160" placeholder="e.g. Excel me VLOOKUP kaise use kare" />' +
      '<div style="height:10px"></div><button class="btn amber" id="homeGo">✨ Content Package Banao</button></div>' +
      '<h2 style="margin:4px 2px 10px">Features</h2><div class="grid">' + feats + '</div>' +
      '<div class="card"><h2>Kaise kaam karta hai?</h2>' +
      '<div class="kv"><span>1️⃣ Video title likhein</span></div>' +
      '<div class="kv"><span>2️⃣ AI poora package banata hai</span></div>' +
      '<div class="kv"><span>3️⃣ Copy karein, thumbnail download karein</span></div>' +
      '<div class="kv"><span>4️⃣ History aapke Google Drive me save</span></div></div>' +
      '<div class="card"><div class="owner"><img src="icons/logo.png" alt="" /><div>' +
      '<h3>' + esc(O.name) + '</h3><p class="muted">' + esc(O.role) + '<br>' + esc(O.brand) + '</p></div></div>' +
      '<div style="height:10px"></div><button class="btn ghost" data-go="about">Owner ki jaankari dekhein</button></div>';
    $('#homeGo').onclick = function () {
      var v = $('#homeTitle').value;
      go('generate', { title: v, auto: !!AI.clean(v) });
    };
    $('#homeTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#homeGo').click(); });
    $all('.fcard', el).forEach(function (b) {
      b.onclick = function () {
        var f = FEATURES[+b.getAttribute('data-feat')];
        if (f.install) return doInstall();
        go(f.go || 'generate', { focus: true });
      };
    });
  }

  /* ---------------- GENERATE ---------------- */
  function renderGenerate(opts) {
    var el = $('#page-generate');
    if (!el.getAttribute('data-ready')) {
      el.setAttribute('data-ready', '1');
      el.innerHTML =
        '<div class="card"><h2>✨ Create Content Package</h2>' +
        '<label class="lbl" for="vTitle">Video Title (sirf title chahiye)</label>' +
        '<input type="text" id="vTitle" maxlength="160" placeholder="e.g. Excel me VLOOKUP kaise use kare" autocomplete="off" />' +
        '<div style="height:10px"></div><button class="btn" id="genBtn">Generate Package</button>' +
        '<p class="muted" id="modeInfo" style="margin-top:10px"></p></div>' +
        '<div id="resultArea"></div>';
      $('#genBtn').onclick = onGenerate;
      $('#vTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') onGenerate(); });
    }
    updateModeInfo();
    if (opts.title != null) $('#vTitle').value = opts.title;
    if (opts.entry) { state.current = opts.entry; $('#vTitle').value = opts.entry.topic; renderResult(); }
    else if (!state.current) $('#resultArea').innerHTML = '';
    if (opts.focus) setTimeout(function () { $('#vTitle').focus(); }, 50);
    if (opts.auto) onGenerate();
  }

  function updateModeInfo() {
    var s = state.settings;
    var info = $('#modeInfo');
    if (!info) return;
    if (s.mode === 'shared') {
      info.innerHTML = '🔐 Mode: <b>GD Free Credits</b> (Google sign-in zaruri)' +
        (state.credits != null ? ' • Aaj bache: <b>' + state.credits + '</b>' : '') +
        (DR.isSignedIn() ? '' : ' • <a href="#/settings" data-go="settings">Sign in karein</a>');
    } else {
      info.innerHTML = '🔑 Mode: <b>Meri apni Gemini key</b>' +
        (s.apiKey ? '' : ' • <a href="#/settings" data-go="settings">Key add karein</a>');
    }
  }

  async function onGenerate() {
    if (state.busy) return;
    var title = AI.clean($('#vTitle').value);
    if (!title) { toast('Pehle video title likhein', true); $('#vTitle').focus(); return; }
    var s = state.settings;
    var opts = { mode: s.mode, model: s.model };

    if (s.mode === 'shared') {
      if (!DR.isSignedIn()) { toast('Pehle Google se sign in karein (Settings)', true); go('settings'); return; }
      try { opts.token = await DR.getAccessToken(); } catch (e) { toast(e.message, true); return; }
    } else {
      if (!s.apiKey) { toast('Settings me apni free Gemini API key add karein', true); go('settings'); return; }
      opts.apiKey = s.apiKey;
    }

    state.busy = true;
    $('#genBtn').disabled = true;
    $('#resultArea').innerHTML =
      '<div class="card loader"><div class="spin"></div><b>AI kaam kar raha hai…</b>' +
      '<p class="muted">Titles, SEO, thumbnail aur quiz ban rahe hain (10-30 sec)</p></div>';
    try {
      var out = await AI.generatePackage(title, opts);
      if (out.meta && out.meta.remaining != null) state.credits = out.meta.remaining;
      var entry = { id: uid(), ts: Date.now(), topic: title, data: out.data, thumbFileId: '' };
      state.current = entry;
      state.history.unshift(entry);
      state.history = state.history.slice(0, MAX_HISTORY);
      saveLocalHistory();
      updateModeInfo();
      await renderResult();
      persistToDrive(entry);
    } catch (e) {
      $('#resultArea').innerHTML = '<div class="card"><h3>⚠️ Problem aaya</h3><p>' + esc(e.message) + '</p></div>';
      toast(e.message, true);
    } finally {
      state.busy = false;
      var b = $('#genBtn'); if (b) b.disabled = false;
    }
  }

  function sectionHead(title, text) {
    return '<div class="sec-head"><h3>' + title + '</h3><button class="copy" data-copy="' + reg(text) + '">Copy</button></div>';
  }

  async function renderResult() {
    var e = state.current;
    if (!e) return;
    var d = e.data;
    var s = state.settings;
    copyStore = {}; copySeq = 0;

    var titlesHtml = d.titles.slice(0, 3).map(function (t, i) {
      return '<div class="title-item' + (i === d.bestTitleIndex ? ' best' : '') + '" data-copy="' + reg(t.text) + '">' +
        (i + 1) + '. ' + esc(t.text) + (t.style ? '<small>' + esc(t.style) + (i === d.bestTitleIndex ? ' • ⭐ Best' : '') + ' • tap to copy</small>' : '') + '</div>';
    }).join('');
    var best = d.titles[d.bestTitleIndex] || d.titles[0];
    var titlesCopy = d.titles.slice(0, 3).map(function (t, i) { return (i + 1) + '. ' + t.text; }).join('\n') + '\n\nBest Recommended Title:\n' + best.text;

    var quizHtml = d.quiz.map(function (q, qi) {
      var opts = q.options.map(function (o, k) {
        return '<button class="opt" data-q="' + qi + '" data-k="' + k + '"><b>' + 'ABCD'[k] + '.</b><span>' + esc(o) + '</span></button>';
      }).join('');
      return '<div class="quiz-q" id="quiz' + qi + '"><div class="sec-head"><span class="lvl">Question ' + (qi + 1) + ' – ' + esc(q.difficulty) +
        '</span><button class="copy" data-copy="' + reg(AI.quizToText(q, qi)) + '">Copy</button></div><div><b>' + esc(q.question) + '</b></div>' +
        opts + '<div class="expl" id="expl' + qi + '"><b>Correct: ' + 'ABCD'[q.correctIndex] + '.</b> ' + esc(q.explanation) + '</div></div>';
    }).join('');
    var quizAll = d.quiz.map(AI.quizToText).join('\n\n');

    var palOpts = '<option value="ai">AI pick</option>' + Object.keys(TH.PRESETS).map(function (k) {
      return '<option value="' + k + '"' + (s.palette === k ? ' selected' : '') + '>' + TH.PRESETS[k].name + '</option>';
    }).join('');
    var layOpts = [['ai', 'AI pick'], ['left', 'Left'], ['center', 'Center'], ['split', 'Split']].map(function (a) {
      return '<option value="' + a[0] + '"' + (s.layout === a[0] ? ' selected' : '') + '>' + a[1] + '</option>';
    }).join('');

    $('#resultArea').innerHTML =
      '<div class="card"><div class="sec-head"><h2>🎬 Content Package</h2><button class="copy" data-copy="' + reg(AI.toMarkdown(d)) + '">Copy All</button></div>' +
      '<p class="muted"><b>Topic:</b> ' + esc(d.topic) + '</p>' +
      '<div class="row"><button class="btn ghost sm" id="dlMd">⬇️ Download .md</button><button class="btn ghost sm" id="newBtn">➕ Naya title</button></div></div>' +

      '<div class="card">' + sectionHead('1. SEO-Friendly Titles', titlesCopy) + titlesHtml +
      '<p class="muted">⭐ Best Recommended: <b>' + esc(best.text) + '</b></p></div>' +

      '<div class="card">' + sectionHead('2. Short YouTube Description', d.description) +
      '<div class="desc">' + esc(d.description) + '</div></div>' +

      '<div class="card">' + sectionHead('3. Tags / Hashtags', d.hashtags.join(' ')) +
      '<div class="chips">' + d.hashtags.map(function (h) { return '<span class="chip">' + esc(h) + '</span>'; }).join('') + '</div></div>' +

      '<div class="card">' + sectionHead('4. SEO Keywords', d.keywords.join(', ')) +
      '<div class="chips">' + d.keywords.map(function (k) { return '<span class="chip kw">' + esc(k) + '</span>'; }).join('') + '</div>' +
      '<p class="muted" style="margin-top:8px">' + d.keywords.length + ' keywords • comma separated copy</p></div>' +

      '<div class="card"><div class="sec-head"><h3>5. Thumbnail</h3></div>' +
      '<div class="thumb-wrap" id="thumbWrap"></div>' +
      '<div class="thumb-meta">Size: 1280 × 720 px • Text: <b>' + esc(d.thumbnail.text) + '</b></div>' +
      '<p class="muted"><b>Visual Concept:</b> ' + esc(d.thumbnail.visualConcept) + '</p>' +
      '<div class="row"><div><label class="lbl">Colours</label><select id="tPal">' + palOpts + '</select></div>' +
      '<div><label class="lbl">Layout</label><select id="tLay">' + layOpts + '</select></div></div>' +
      '<label class="lbl" style="margin-top:10px"><input type="checkbox" id="tMascot"' + (s.mascot ? ' checked' : '') + '> Mascot dikhayein</label>' +
      '<button class="btn amber" id="dlThumb">⬇️ Download Thumbnail (1280×720 PNG)</button></div>' +

      '<div class="card"><div class="sec-head"><h3>6. Quiz Questions</h3><button class="copy" data-copy="' + reg(quizAll) + '">Copy All</button></div>' +
      '<p class="muted">Option par tap karke check karein.</p>' + quizHtml +
      '<button class="btn ghost" id="showAns">Sab answers dikhayein</button></div>';

    wireResult();
    await drawThumb();
  }

  function wireResult() {
    var area = $('#resultArea');
    $all('[data-copy]', area).forEach(function (b) {
      b.onclick = function () { copyText(copyStore[b.getAttribute('data-copy')], b.classList.contains('copy') ? b : null); };
    });
    $all('.opt', area).forEach(function (b) {
      b.onclick = function () {
        var q = +b.getAttribute('data-q'), k = +b.getAttribute('data-k');
        var correct = state.current.data.quiz[q].correctIndex;
        $all('.opt[data-q="' + q + '"]', area).forEach(function (o) { o.classList.remove('ok', 'bad'); });
        b.classList.add(k === correct ? 'ok' : 'bad');
        if (k !== correct) $('.opt[data-q="' + q + '"][data-k="' + correct + '"]', area).classList.add('ok');
        $('#expl' + q).classList.add('show');
      };
    });
    $('#showAns').onclick = function () {
      state.current.data.quiz.forEach(function (q, i) {
        $all('.opt[data-q="' + i + '"]', area).forEach(function (o, k) { o.classList.toggle('ok', k === q.correctIndex); });
        $('#expl' + i).classList.add('show');
      });
    };
    $('#dlMd').onclick = function () {
      var blob = new Blob([AI.toMarkdown(state.current.data)], { type: 'text/markdown' });
      downloadBlob(blob, 'youtube-content-package-' + slug(state.current.topic) + '.md');
    };
    $('#newBtn').onclick = function () {
      state.current = null; $('#resultArea').innerHTML = ''; $('#vTitle').value = ''; $('#vTitle').focus();
    };
    ['tPal', 'tLay'].forEach(function (id) {
      $('#' + id).onchange = function () {
        state.settings.palette = $('#tPal').value; state.settings.layout = $('#tLay').value; saveSettings(); drawThumb();
      };
    });
    $('#tMascot').onchange = function () { state.settings.mascot = $('#tMascot').checked; saveSettings(); drawThumb(); };
    $('#dlThumb').onclick = async function () {
      if (!state.thumbCanvas) await drawThumb();
      var blob = await TH.toBlob(state.thumbCanvas);
      if (!blob) return toast('Thumbnail export nahi hua', true);
      downloadBlob(blob, 'thumbnail-' + slug(state.current.topic) + '-1280x720.png');
    };
  }

  async function drawThumb() {
    var e = state.current;
    if (!e) return null;
    var s = state.settings;
    try {
      var c = await TH.render(e.data.thumbnail, { palette: s.palette, layout: s.layout, mascot: s.mascot });
      state.thumbCanvas = c;
      var wrap = $('#thumbWrap');
      if (wrap) { wrap.innerHTML = ''; wrap.appendChild(c); }
      return c;
    } catch (err) {
      toast('Thumbnail banane me problem: ' + err.message, true);
      return null;
    }
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  /* ---------------- Drive persistence ---------------- */
  async function persistToDrive(entry) {
    if (!DR.isSignedIn()) return;
    try {
      var canvas = state.thumbCanvas || (await drawThumb());
      if (canvas) {
        var blob = await TH.toBlob(canvas);
        if (blob) entry.thumbFileId = await DR.saveThumbnail(entry.id, blob);
      }
      saveLocalHistory();
      await DR.saveHistory(state.history.slice(0, MAX_HISTORY));
      toast('☁️ Aapke Google Drive me save ho gaya');
    } catch (e) {
      toast('Drive save nahi hua: ' + e.message, true);
    }
  }

  async function syncFromDrive(silent) {
    if (!DR.isSignedIn()) return;
    try {
      var remote = await DR.loadHistory();
      var map = {};
      state.history.concat(remote).forEach(function (h) { if (h && h.id && !map[h.id]) map[h.id] = h; });
      state.history = Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (a, b) { return b.ts - a.ts; }).slice(0, MAX_HISTORY);
      saveLocalHistory();
      await DR.saveHistory(state.history);
      if (!silent) toast('Drive se sync ho gaya ✅');
    } catch (e) {
      if (!silent) toast('Sync fail: ' + e.message, true);
    }
  }

  /* ---------------- HISTORY ---------------- */
  function renderHistory() {
    var el = $('#page-history');
    var items = state.history.map(function (h) {
      return '<div class="hitem"><div class="meta"><b>' + esc(h.topic) + '</b><small>' + esc(fmtDate(h.ts)) +
        (h.thumbFileId ? ' • ☁️' : '') + '</small></div>' +
        '<button class="btn sm" data-open="' + esc(h.id) + '">Open</button>' +
        '<button class="btn sm danger" data-del="' + esc(h.id) + '" aria-label="Delete">🗑️</button></div>';
    }).join('');
    el.innerHTML =
      '<div class="card"><div class="sec-head"><h2>🗂️ History</h2>' +
      (DR.isSignedIn() ? '<button class="btn ghost sm" id="syncBtn">🔄 Sync Drive</button>' : '') + '</div>' +
      '<p class="muted">' + (DR.isSignedIn()
        ? 'Save location: aapka Google Drive → "' + esc(GD.DRIVE_FOLDER_NAME) + '" folder.'
        : 'Abhi sirf is device me save ho raha hai. Settings me Google Drive connect karein.') + '</p></div>' +
      (items || '<div class="card muted">Abhi koi history nahi. Pehla package banayein ✨</div>');
    $all('[data-open]', el).forEach(function (b) {
      b.onclick = function () {
        var h = state.history.find(function (x) { return x.id === b.getAttribute('data-open'); });
        if (h) go('generate', { entry: h });
      };
    });
    $all('[data-del]', el).forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('Is item ko delete karein?')) return;
        var id = b.getAttribute('data-del');
        var h = state.history.find(function (x) { return x.id === id; });
        state.history = state.history.filter(function (x) { return x.id !== id; });
        if (state.current && state.current.id === id) state.current = null;
        saveLocalHistory();
        renderHistory();
        if (DR.isSignedIn()) {
          try {
            if (h && h.thumbFileId) await DR.trashFile(h.thumbFileId);
            await DR.saveHistory(state.history);
          } catch (e) { toast('Drive update fail: ' + e.message, true); }
        }
      };
    });
    var sb = $('#syncBtn');
    if (sb) sb.onclick = async function () { await syncFromDrive(false); renderHistory(); };
  }

  /* ---------------- SETTINGS ---------------- */
  function renderSettings() {
    var el = $('#page-settings');
    var s = state.settings;
    var u = DR.getUser();
    var sharedReady = GD.APPS_SCRIPT_URL && !/PASTE_/.test(GD.APPS_SCRIPT_URL);
    el.innerHTML =
      (isOwner() ? '<div class="card"><h2>🛡️ Admin</h2><p class="muted">Aap owner hain. Stats aur shared AI settings yahan hain.</p><button class="btn amber" data-go="admin">Admin Panel kholein</button></div>' : '') +
      '<div class="card"><h2>☁️ Google Drive (Aapka Data)</h2>' +
      (u
        ? '<div class="owner"><img src="' + esc(u.picture || 'icons/icon-192.png') + '" alt="" referrerpolicy="no-referrer" style="width:52px;height:52px;border-radius:50%" />' +
          '<div><b>' + esc(u.name) + '</b><br><span class="muted">' + esc(u.email) + '</span></div></div>' +
          '<p class="muted" style="margin-top:8px">History aur thumbnails aapke apne Drive ke "' + esc(GD.DRIVE_FOLDER_NAME) + '" folder me save hote hain. App sirf apni banayi files dekh sakta hai.</p>' +
          '<div class="row"><button class="btn ghost sm" id="openDrive">📂 Folder kholein</button><button class="btn danger sm" id="signOut">Sign out</button></div>'
        : '<p class="muted">Google se sign in karein. Aapka data sirf <b>aapke apne Google Drive</b> me store hoga - owner ke paas nahi.</p>' +
          '<button class="btn" id="signIn">🔐 Sign in with Google</button><div class="notice" id="signErr" style="display:none;margin-top:10px"></div>' +
          (DR.configured() ? '' : '<p class="notice" style="margin-top:10px">Admin setup baaki hai: js/config.js me GOOGLE_CLIENT_ID daalein.</p>')) +
      '</div>' +

      '<div class="card"><h2>🤖 AI Mode</h2><div class="seg">' +
      '<label class="' + (s.mode === 'shared' ? 'sel' : '') + '"><input type="radio" name="mode" value="shared"' + (s.mode === 'shared' ? ' checked' : '') + '>GD Free Credits' +
      '<br><span class="muted">Sign in + daily limit</span></label>' +
      '<label class="' + (s.mode === 'own' ? 'sel' : '') + '"><input type="radio" name="mode" value="own"' + (s.mode === 'own' ? ' checked' : '') + '>Meri apni key' +
      '<br><span class="muted">Free Gemini key</span></label></div>' +
      (sharedReady ? '' : '<p class="notice" style="margin-top:10px">Shared credits abhi setup nahi hain. Apni free Gemini key use karein.</p>') +
      '<div style="height:12px"></div><label class="lbl" for="apiKey">Gemini API Key (free)</label>' +
      '<input type="password" id="apiKey" placeholder="AIza..." autocomplete="off" value="' + esc(s.apiKey) + '" />' +
      '<p class="muted" style="margin-top:6px">Key sirf is device ke browser me rehti hai. <a href="' + esc(GD.GET_KEY_URL) + '" target="_blank" rel="noopener">Free key yahan se lein ↗</a></p>' +
      '<label class="lbl" for="model" style="margin-top:8px">Model</label>' +
      '<input type="text" id="model" value="' + esc(s.model) + '" />' +
      '<button class="btn ghost sm" id="listModelsBtn" style="margin-top:8px">🔎 Available models dekhein</button><div id="modelsOut" class="chips" style="margin-top:8px"></div>' +
      '<div style="height:10px"></div><button class="btn" id="saveSet">Save Settings</button></div>' +

      '<div class="card"><h2>🩺 Connection Check</h2><p class="muted">Login ya server me problem ho to ye chalayein. Ye bata dega ki kya galat set hai.</p>' +
      '<button class="btn" id="diagBtn">Check chalayein</button><div id="diagOut" style="margin-top:10px"></div></div>' +
      '<div class="card"><h2>🎨 App</h2><button class="btn ghost" id="themeBtn2">Theme: ' + (s.theme === 'dark' ? 'Dark → Light' : 'Light → Dark') + '</button>' +
      '<div style="height:8px"></div><button class="btn amber" id="installBtn">📲 Install App</button>' +
      '<div style="height:8px"></div><button class="btn ghost" id="forceBtn">🔄 App ko force update karein</button>' +
      '<div style="height:8px"></div><button class="btn danger" id="clearBtn">Is device ka local data clear karein</button></div>' +

      '<div class="card"><h2>ℹ️ About App</h2>' +
      '<div class="kv"><span>App</span><b>' + esc(GD.APP.name) + '</b></div>' +
      '<div class="kv"><span>Version</span><b>' + esc(GD.APP.version) + '</b></div>' +
      '<div class="kv"><span>Build (code)</span><b>' + esc(APP_BUILD) + '</b></div>' +
      '<div class="kv"><span>Brand</span><b>' + esc(O.brand) + '</b></div></div>';

    $all('input[name="mode"]', el).forEach(function (r) {
      r.onchange = function () {
        state.settings.mode = r.value; saveSettings();
        $all('.seg label', el).forEach(function (l) { l.classList.toggle('sel', l.querySelector('input').checked); });
      };
    });
    $('#listModelsBtn').onclick = async function () {
      var key = $('#apiKey').value.trim() || state.settings.apiKey;
      var out = $('#modelsOut');
      if (!key) { toast('Pehle Gemini API key daalein', true); return; }
      out.innerHTML = '<span class="muted">Load ho raha hai…</span>';
      try {
        var list = await AI.listModels(key);
        out.innerHTML = list.length
          ? list.map(function (id) { return '<button class="chip" data-m="' + esc(id) + '" style="border:0;cursor:pointer">' + esc(id) + '</button>'; }).join('')
          : '<span class="muted">Koi model nahi mila.</span>';
        $all('[data-m]', out).forEach(function (b) {
          b.onclick = function () { $('#model').value = b.getAttribute('data-m'); toast('Model chuna. "Save Settings" dabayein'); };
        });
      } catch (e) { out.innerHTML = ''; toast(e.message, true); }
    };
    $('#saveSet').onclick = function () {
      state.settings.apiKey = $('#apiKey').value.trim();
      state.settings.model = $('#model').value.trim() || 'gemini-3.5-flash-lite';
      saveSettings(); toast('Settings save ho gayi ✅');
    };
    $('#themeBtn2').onclick = toggleTheme;
    $('#installBtn').onclick = doInstall;
    $('#forceBtn').onclick = forceUpdate;
    $('#diagBtn').onclick = runDiagnostics;
    $('#clearBtn').onclick = function () {
      if (!confirm('Local history, settings aur API key delete hongi. Drive ka data safe rahega. Continue?')) return;
      try { localStorage.removeItem(LS_HIST); localStorage.removeItem(LS_SET); } catch (e) {}
      state.history = []; state.current = null; state.settings = defaultSettings(); applyTheme(); renderSettings(); toast('Local data clear ho gaya');
    };
    var si = $('#signIn');
    if (si) si.onclick = async function () {
      si.disabled = true;
      var box = $('#signErr');
      if (box) box.style.display = 'none';
      try {
        await DR.signIn();
        var derr = DR.getDriveError();
        if (!derr) await syncFromDrive(true);
        await refreshAdminFlag();
        updateNav();
        renderSettings();
        if (derr) toast('Login ho gaya, par Drive me problem: ' + derr, true);
        else toast('Google Drive connect ho gaya ✅');
      } catch (e) {
        if (box) {
          box.innerHTML = '<b>Login nahi hua:</b> ' + esc(e.message) + '<br><small>Neeche "Connection Check" chalayein aur uski report bhejein.</small>';
          box.style.display = 'block';
        }
        toast(e.message, true);
        si.disabled = false;
      }
    };
    var so = $('#signOut');
    if (so) so.onclick = function () { DR.signOut(); state.credits = null; try { localStorage.removeItem(LS_ADMIN); } catch (e) {} toast('Sign out ho gaye'); updateNav(); renderSettings(); };
    var od = $('#openDrive');
    if (od) od.onclick = function () { window.open(DR.folderUrl(), '_blank', 'noopener'); };
  }

  /* ---------------- ABOUT ---------------- */
  function renderAbout() {
    var el = $('#page-about');
    el.innerHTML =
      '<div class="card hero"><div class="owner"><img src="icons/logo.png" alt="" style="background:none" />' +
      '<div><span class="badge">OWNER</span><h2 style="margin:0">' + esc(O.name) + '</h2><p style="margin:0;font-size:13px;opacity:.9">' + esc(O.role) + '</p></div></div></div>' +
      '<div class="card"><h2>About</h2>' + O.about.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '<div class="chips">' + O.skills.map(function (k) { return '<span class="chip">' + esc(k) + '</span>'; }).join('') + '</div></div>' +
      '<div class="card linklist"><h2>Contact</h2>' +
      '<a href="tel:' + esc(O.phone) + '">📞 ' + esc(O.phoneDisplay) + '</a>' +
      '<a href="' + esc(O.whatsapp) + '" target="_blank" rel="noopener">💬 WhatsApp Chat</a>' +
      '<a href="mailto:' + esc(O.email) + '">✉️ ' + esc(O.email) + '</a>' +
      '<a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(O.location) + '" target="_blank" rel="noopener">📍 ' + esc(O.location) + '</a>' +
      '<a href="' + esc(O.website) + '" target="_blank" rel="noopener">🌐 gyaankadabba.blogspot.com</a></div>' +
      '<div class="card linklist"><h2>Social Media</h2><div class="social">' +
      O.social.map(function (s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + s.icon + ' ' + esc(s.label) + '</a>'; }).join('') + '</div></div>' +
      '<div class="card linklist"><h2>Quick Links</h2>' +
      O.links.map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.label) + '</a>'; }).join('') + '</div>';
  }

  /* ---------------- ADMIN (owner only) ----------------
     Yahan ka check sirf UI chhupane ke liye hai. Asli suraksha server par hai:
     har admin request par Apps Script Google token se email verify karta hai. */
  function getAdminFlag() {
    try { return JSON.parse(localStorage.getItem(LS_ADMIN)); } catch (e) { return null; }
  }
  function setAdminFlag(email, isAdmin) {
    try { localStorage.setItem(LS_ADMIN, JSON.stringify({ email: String(email).toLowerCase(), isAdmin: !!isAdmin })); } catch (e) {}
  }
  // Server (ADMIN_EMAILS) ka jawab sabse upar; server se jawab na mila ho to config ka email hint
  function isOwner() {
    var u = DR.getUser();
    if (!u || !u.email) return false;
    var email = String(u.email).toLowerCase();
    var f = getAdminFlag();
    if (f && f.email === email) return !!f.isAdmin;
    var list = (GD.ADMIN_EMAILS && GD.ADMIN_EMAILS.length ? GD.ADMIN_EMAILS : [O.email]).map(function (x) {
      return String(x).toLowerCase();
    });
    return list.indexOf(email) >= 0;
  }
  async function refreshAdminFlag() {
    if (!DR.isSignedIn() || !DR.hasValidToken()) return null;
    try {
      var out = await adminCall('whoami');
      setAdminFlag(out.email, out.isAdmin);
      updateNav();
      return out;
    } catch (e) { return null; }
  }

  function updateNav() {
    var nav = $('.nav');
    var old = $('.nav [data-go="admin"]');
    if (old) old.remove();
    if (isOwner()) {
      var b = document.createElement('button');
      b.setAttribute('data-go', 'admin');
      b.innerHTML = '<span class="i">🛡️</span>Admin';
      b.onclick = function () { go('admin'); };
      if (state.page === 'admin') b.classList.add('active');
      nav.appendChild(b);
    }
  }

  async function adminCall(action, extra) {
    if (!GD.APPS_SCRIPT_URL || /PASTE_/.test(GD.APPS_SCRIPT_URL)) throw new Error('APPS_SCRIPT_URL set nahi hai (js/config.js).');
    var token = await DR.getAccessToken();
    var res;
    try {
      res = await fetch(GD.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, token: token }, extra || {}))
      });
    } catch (e) { throw new Error('Server se connect nahi ho paya. Internet check karein.'); }
    var out;
    try { out = await res.json(); } catch (e) { throw new Error('Server ka response galat hai. Apps Script me naya version deploy kiya?'); }
    if (!out.ok) {
      if (/Unknown action/i.test(out.error || '')) throw new Error('Apps Script me purana code chal raha hai. Naya Code.gs paste karke "New version" deploy karein.');
      throw new Error(out.error || 'Server error');
    }
    return out;
  }

  async function renderAdmin() {
    var el = $('#page-admin');
    if (!isOwner()) {
      el.innerHTML = '<div class="card"><h2>🛡️ Admin</h2><p class="muted">Ye page sirf owner ke liye hai. Settings me owner ke Google account se sign in karein.</p>' +
        '<button class="btn" data-go="settings">Settings kholein</button></div>';
      return;
    }
    el.innerHTML = '<div class="card loader"><div class="spin"></div><b>Admin data load ho raha hai…</b></div>';
    var d;
    try { d = await adminCall('adminStats'); }
    catch (e) {
      el.innerHTML = '<div class="card"><h2>⚠️ Admin load nahi hua</h2><p>' + esc(e.message) + '</p><button class="btn ghost" id="admRetry">Dobara try karein</button></div>';
      $('#admRetry').onclick = renderAdmin;
      return;
    }
    drawAdmin(el, d);
  }

  function drawAdmin(el, d) {
    var c = d.config;
    var today = d.days[0];
    var max = Math.max.apply(null, d.days.map(function (x) { return x.requests; }).concat([1]));
    var bars = d.days.map(function (x) {
      var label = x.day.slice(6, 8) + '/' + x.day.slice(4, 6);
      return '<div class="bar-row"><span>' + label + '</span><div class="bar"><i style="width:' + Math.round(x.requests / max * 100) +
        '%"></i></div><b>' + x.requests + ' • 👤' + x.users + '</b></div>';
    }).join('');
    el.innerHTML =
      '<div class="card hero"><span class="badge">ADMIN</span><h2 style="margin:0">🛡️ Admin Panel</h2>' +
      '<p style="margin:4px 0 0;font-size:13px;opacity:.9">' + esc(d.admin) + '</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + today.requests + '</b><span>Aaj requests</span></div>' +
      '<div class="stat"><b>' + today.users + '</b><span>Aaj users</span></div>' +
      '<div class="stat"><b>' + d.totalAll + '</b><span>Total requests</span></div></div>' +
      '<div class="card"><div class="sec-head"><h3>Pichhle 7 din</h3><button class="btn ghost sm" id="admRefresh">🔄 Refresh</button></div>' + bars +
      '<p class="muted" style="margin-top:8px">Bar = shared credits se hui requests, 👤 = unique users. Gintee admin update deploy hone ke baad se shuru hoti hai.</p></div>' +
      '<div class="card"><h3>Server status</h3>' +
      '<div class="kv"><span>Gemini API key</span><b>' + (c.keySet ? '✅ Set' : '❌ Missing') + '</b></div>' +
      '<div class="kv"><span>Google Client ID</span><b>' + (c.clientIdSet ? '✅ Set' : '❌ Missing') + '</b></div></div>' +
      '<div class="card"><h3>Shared AI Settings</h3>' +
      '<label class="lbl" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="admShared"' + (c.sharedEnabled ? ' checked' : '') + '> Shared free credits ON</label>' +
      '<div class="row" style="margin-top:10px"><div><label class="lbl" for="admUser">Per-user daily limit</label><input type="text" inputmode="numeric" id="admUser" value="' + esc(c.dailyLimitUser) + '"></div>' +
      '<div><label class="lbl" for="admGlobal">Total daily limit</label><input type="text" inputmode="numeric" id="admGlobal" value="' + esc(c.dailyLimitGlobal) + '"></div></div>' +
      '<label class="lbl" for="admModels" style="margin-top:10px">Models (comma separated)</label><input type="text" id="admModels" value="' + esc(c.models) + '">' +
      '<label class="lbl" for="admKey" style="margin-top:10px">Naya Gemini API key (optional)</label>' +
      '<input type="password" id="admKey" autocomplete="off" placeholder="' + (c.keySet ? 'Key set hai. Khaali chhodein to wahi rahegi' : 'AIza...') + '">' +
      '<p class="muted" style="margin-top:6px">Key kabhi wapas dikhayi nahi jaati, sirf badli ja sakti hai.</p>' +
      '<div style="height:10px"></div><button class="btn" id="admSave">Save Admin Settings</button></div>' +
      '<div class="card"><h3>🔎 Models check</h3><p class="muted">Aapki Gemini key par kaun se models chal rahe hain, yahan dekhein aur test karein. "Use" dabane par model list ke upar set hota hai, phir upar "Save Admin Settings" dabayein.</p>' +
      '<button class="btn ghost" id="admModelsBtn">Available models dekhein</button><div id="admModelsOut" style="margin-top:10px"></div></div>';
    $('#admRefresh').onclick = renderAdmin;
    $('#admModelsBtn').onclick = async function () {
      var out = $('#admModelsOut');
      out.innerHTML = '<p class="muted">Load ho raha hai…</p>';
      try {
        var r = await adminCall('adminModels');
        if (!r.models.length) { out.innerHTML = '<p class="muted">Koi model nahi mila.</p>'; return; }
        out.innerHTML = r.models.map(function (m) {
          return '<div class="mrow"><div class="mhead"><b>' + esc(m.id) + '</b><button class="btn ghost sm" data-test="' + esc(m.id) +
            '">Test</button><button class="btn sm" data-use="' + esc(m.id) + '">Use</button></div><small class="mres"></small></div>';
        }).join('');
        $all('[data-test]', out).forEach(function (b) {
          b.onclick = async function () {
            var res = b.closest('.mrow').querySelector('.mres');
            res.textContent = 'Test ho raha hai…';
            try {
              var t = await adminCall('adminTestModel', { model: b.getAttribute('data-test') });
              res.textContent = t.works ? '✅ Chal raha hai' : '❌ ' + t.detail;
            } catch (e) { res.textContent = '❌ ' + e.message; }
          };
        });
        $all('[data-use]', out).forEach(function (b) {
          b.onclick = function () {
            var id = b.getAttribute('data-use');
            var cur = $('#admModels').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean).filter(function (x) { return x !== id; });
            $('#admModels').value = [id].concat(cur).slice(0, 4).join(',');
            toast(id + ' list ke upar set hua. "Save Admin Settings" dabayein');
          };
        });
      } catch (e) { out.innerHTML = '<p class="muted">❌ ' + esc(e.message) + '</p>'; }
    };
    $('#admSave').onclick = async function () {
      var btn = this;
      btn.disabled = true;
      try {
        var cfg = {
          sharedEnabled: $('#admShared').checked,
          dailyLimitUser: parseInt($('#admUser').value, 10),
          dailyLimitGlobal: parseInt($('#admGlobal').value, 10),
          models: $('#admModels').value.trim()
        };
        var k = $('#admKey').value.trim();
        if (k) cfg.apiKey = k;
        var out = await adminCall('adminSave', { config: cfg });
        toast('Admin settings save ho gayi ✅');
        drawAdmin(el, out);
      } catch (e) { toast(e.message, true); btn.disabled = false; }
    };
  }

  async function runDiagnostics() {
    var box = $('#diagOut');
    box.innerHTML = '<p class="muted">Check ho raha hai…</p>';
    var d = DR.diagnose();
    var rows = [];
    function add(ok, label, tip) { rows.push({ ok: ok, label: label, tip: tip || '' }); }
    add(true, 'App build: ' + APP_BUILD);
    add(true, 'Site origin: ' + d.origin + d.path + ' (Google Cloud ke "Authorized JavaScript origins" me sirf ' + d.origin + ' hona chahiye)');
    add(d.secure, 'HTTPS secure connection', 'App ko https:// link se kholein.');
    add(d.clientIdSet, 'Client ID config.js me set hai', 'js/config.js me GOOGLE_CLIENT_ID daalein aur GitHub par upload karein.');
    add(d.clientIdFormatOk, 'Client ID format: ' + d.clientIdMasked, 'Client ID "1234-abc.apps.googleusercontent.com" jaisa hona chahiye (Client secret ya project ID nahi).');
    add(d.gisLoaded, 'Google Sign-In script load hui', 'Internet, ad-blocker ya DNS check karein.');
    add(!d.inAppBrowser, 'Normal browser me khula hai', 'WhatsApp/Telegram/Facebook ke andar se na kholein. Link ko Chrome me kholein.');
    var url = GD.APPS_SCRIPT_URL;
    if (!url || /PASTE_/.test(url)) {
      add(false, 'Apps Script URL set nahi hai', 'js/config.js me APPS_SCRIPT_URL daalein.');
    } else {
      try {
        var r = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'action=status');
        var j = await r.json();
        add(!!j.ok, 'Apps Script server chal raha hai' + (j.ok ? ' (shared AI: ' + (j.sharedKeyEnabled ? 'ON' : 'OFF ya key missing') + ')' : ''), 'Deploy: Execute as Me, Access Anyone, URL /exec par khatam.');
      } catch (e) {
        add(false, 'Apps Script server se connect nahi hua', 'Web app access "Anyone" ho aur URL sahi ho.');
      }
    }
    add(DR.isSignedIn(), 'Google sign-in: ' + (DR.isSignedIn() ? DR.getUser().email : 'abhi sign in nahi'), 'Upar "Sign in with Google" dabayein. Error aaye to uska exact text bhejein.');
    if (DR.isSignedIn()) {
      var de = DR.getDriveError();
      add(!de, 'Google Drive folder' + (de ? '' : ' ready'), de);
      if (DR.hasValidToken()) {
        try {
          var w = await adminCall('whoami');
          setAdminFlag(w.email, w.isAdmin);
          updateNav();
          add(true, 'Server ne verify kiya: ' + w.email + ' • Admin: ' + (w.isAdmin ? 'HAAN' : 'NAHI'),
            w.isAdmin ? '' : 'Admin banna ho to Apps Script Script Property ADMIN_EMAILS me ye email daalein.');
          if (!w.isAdmin) rows[rows.length - 1].ok = false;
        } catch (e) {
          add(false, 'Server token verify fail: ' + e.message, 'Script Property GOOGLE_CLIENT_ID wahi hona chahiye jo config.js me hai. Apps Script me naya version deploy karein.');
        }
      } else add(true, 'Token expire hai. Server check ke liye dobara sign in karein.');
    }
    var report = rows.map(function (x) { return (x.ok ? '[OK] ' : '[X] ') + x.label + (!x.ok && x.tip ? ' -> ' + x.tip : ''); }).join('\n');
    box.innerHTML = '<div class="diag">' + rows.map(function (x) {
      return '<div class="kv"><span>' + (x.ok ? '✅' : '❌') + ' ' + esc(x.label) +
        (!x.ok && x.tip ? '<br><small class="muted">👉 ' + esc(x.tip) + '</small>' : '') + '</span></div>';
    }).join('') + '</div><div style="height:8px"></div><button class="btn ghost sm" id="diagCopy">📋 Report copy karein</button>';
    $('#diagCopy').onclick = function () { copyText(report, this); };
  }

  async function forceUpdate() {
    try {
      if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.unregister(); }));
      }
      if (window.caches) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }
    } catch (e) {}
    location.reload();
  }

  /* ---------------- PWA install ---------------- */
  function doInstall() {
    if (state.deferredInstall) {
      state.deferredInstall.prompt();
      state.deferredInstall.userChoice.finally(function () { state.deferredInstall = null; });
      return;
    }
    var ua = navigator.userAgent || '';
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return toast('App pehle se installed hai ✅');
    if (/iPhone|iPad|iPod/i.test(ua)) toast('Safari me Share → "Add to Home Screen" dabayein', false);
    else toast('Browser menu (⋮) → "Install app" / "Add to Home screen"', false);
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); state.deferredInstall = e; });
  window.addEventListener('appinstalled', function () { toast('App install ho gaya 🎉'); state.deferredInstall = null; });

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    saveSettings(); applyTheme();
    if (state.page === 'settings') renderSettings();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    applyTheme();
    $('#themeBtn').onclick = toggleTheme;
    $('#footer').innerHTML =
      '<a href="' + esc(GD.BRAND.hubUrl) + '" target="_blank" rel="noopener">' + esc(GD.BRAND.poweredBy) + '</a><br>© ' +
      new Date().getFullYear() + ' ' + esc(O.name) + ' • Made with ❤️ for Education';
    $all('.nav button').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-go')); }; });
    updateNav();
    if (DR.isSignedIn() && DR.hasValidToken()) refreshAdminFlag();
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-go]');
      if (a && !a.closest('.nav')) { e.preventDefault(); go(a.getAttribute('data-go')); }
    });
    var start = (location.hash || '').replace('#/', '');
    go(PAGES.indexOf(start) >= 0 ? start : 'home');
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  }
  boot();
})();

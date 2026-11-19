/* ==========================================================
   AI module: prompt build, Gemini call (own key) / shared proxy,
   JSON parse, normalize + validate (exact rules of master prompt)
   ========================================================== */
(function (root) {
  var CFG = root.GD || {};
  var BUILTIN_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

  /* ---------- helpers ---------- */
  function clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function wordCount(s) {
    return clean(s).split(' ').filter(Boolean).length;
  }

  function dedupe(arr, keyFn) {
    var seen = {};
    return arr.filter(function (x) {
      var k = (keyFn ? keyFn(x) : x).toLowerCase();
      if (!k || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function isHex(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim());
  }

  function shuffleWithIndex(options, correctIndex) {
    var items = options.map(function (t, i) {
      return { t: t, ok: i === correctIndex };
    });
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return {
      options: items.map(function (x) {
        return x.t;
      }),
      correctIndex: items.findIndex(function (x) {
        return x.ok;
      })
    };
  }

  /* ---------- parse model text to object ---------- */
  function parseJson(text) {
    var t = String(text || '').trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      return JSON.parse(t);
    } catch (e) {
      var a = t.indexOf('{');
      var b = t.lastIndexOf('}');
      if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
      throw new Error('AI ka response samajh nahi aaya. Dobara try karein.');
    }
  }

  /* ---------- normalize + validate ----------
     Returns { data, problems[] }. Soft issues are fixed silently;
     hard issues are returned in problems (-> one automatic retry). */
  function normalize(raw, videoTitle) {
    var problems = [];
    var d = {};
    raw = raw || {};

    d.topic = clean(videoTitle || raw.topic);

    // titles
    var titles = (Array.isArray(raw.titles) ? raw.titles : [])
      .map(function (t) {
        if (typeof t === 'string') return { text: clean(t), style: '' };
        return { text: clean(t && t.text), style: clean(t && t.style) };
      })
      .filter(function (t) {
        return t.text;
      });
    titles = dedupe(titles, function (t) {
      return t.text;
    });
    if (titles.length < 3) problems.push('need at least 3 different titles');
    d.titles = titles.slice(0, 5);
    var bi = parseInt(raw.bestTitleIndex, 10);
    d.bestTitleIndex = bi >= 0 && bi < d.titles.length ? bi : 0;

    // description
    var desc = String(raw.description || '')
      .replace(/\r/g, '')
      .split(/\n{2,}/)
      .map(function (p) {
        return clean(p);
      })
      .filter(Boolean);
    if (desc.length < 2) {
      var one = clean(raw.description);
      if (one.length > 160) {
        var sentences = one.match(/[^.!?।]+[.!?।]*/g) || [one];
        var half = Math.ceil(sentences.length / 2);
        desc = [sentences.slice(0, half).join(' ').trim(), sentences.slice(half).join(' ').trim()].filter(Boolean);
      }
    }
    if (desc.length < 2) problems.push('description must have 2-4 short paragraphs');
    d.description = desc.slice(0, 4).join('\n\n');

    // hashtags
    var tags = (Array.isArray(raw.hashtags) ? raw.hashtags : String(raw.hashtags || '').split(/\s+/))
      .map(function (h) {
        h = clean(h).replace(/\s+/g, '');
        if (!h) return '';
        return h.charAt(0) === '#' ? h : '#' + h;
      })
      .filter(function (h) {
        return h.length > 1;
      });
    tags = dedupe(tags);
    var hasBrand = tags.some(function (h) {
      return h.toLowerCase() === '#gdtechacademy';
    });
    if (!hasBrand) tags.push('#GDTechAcademy');
    if (tags.length > 15) {
      // brand tag ko safe rakho
      var rest = tags.filter(function (h) {
        return h.toLowerCase() !== '#gdtechacademy';
      });
      tags = rest.slice(0, 14).concat(['#GDTechAcademy']);
    }
    if (tags.length < 8) problems.push('need 8 to 15 hashtags');
    d.hashtags = tags;

    // keywords
    var kws = (Array.isArray(raw.keywords) ? raw.keywords : String(raw.keywords || '').split(','))
      .map(function (k) {
        return clean(k).replace(/^#/, '');
      })
      .filter(Boolean);
    kws = dedupe(kws);
    if (kws.length < 15) problems.push('need 15 to 25 keywords');
    d.keywords = kws.slice(0, 25);

    // thumbnail
    var th = raw.thumbnail || {};
    var text = clean(th.text).replace(/[\r\n]+/g, ' ');
    var words = text.split(' ').filter(Boolean);
    if (words.length > 6) words = words.slice(0, 6);
    if (words.length < 3) {
      // title ke important words se fallback
      var fb = clean(videoTitle).split(' ').filter(function (w) {
        return w.length > 2;
      });
      words = (words.length ? words.concat(fb) : fb).slice(0, 4);
    }
    var pal = th.palette || {};
    d.thumbnail = {
      text: words.join(' '),
      subtext: clean(th.subtext).split(' ').slice(0, 5).join(' '),
      visualConcept: clean(th.visualConcept),
      emoji: (Array.isArray(th.emoji) ? th.emoji : [])
        .map(clean)
        .filter(Boolean)
        .slice(0, 3),
      layout: ['left', 'center', 'split'].indexOf(th.layout) >= 0 ? th.layout : 'left',
      palette: {
        bg1: isHex(pal.bg1) ? pal.bg1.trim() : '',
        bg2: isHex(pal.bg2) ? pal.bg2.trim() : '',
        accent: isHex(pal.accent) ? pal.accent.trim() : '',
        text: isHex(pal.text) ? pal.text.trim() : ''
      }
    };
    if (!d.thumbnail.visualConcept) problems.push('thumbnail.visualConcept missing');

    // quiz
    var quiz = Array.isArray(raw.quiz) ? raw.quiz : [];
    if (quiz.length !== 3) problems.push('quiz must contain exactly 3 questions');
    var levels = ['Easy', 'Medium', 'Tricky'];
    d.quiz = quiz.slice(0, 3).map(function (q, i) {
      q = q || {};
      var opts = (Array.isArray(q.options) ? q.options : []).map(clean);
      var ci = parseInt(q.correctIndex, 10);
      if (opts.length !== 4 || dedupe(opts).length !== 4) {
        problems.push('quiz ' + (i + 1) + ' needs exactly 4 different options');
      }
      if (!(ci >= 0 && ci < 4)) {
        problems.push('quiz ' + (i + 1) + ' needs one correctIndex 0-3');
        ci = 0;
      }
      if (!clean(q.question)) problems.push('quiz ' + (i + 1) + ' question missing');
      if (!clean(q.explanation)) problems.push('quiz ' + (i + 1) + ' explanation missing');
      var sh = opts.length === 4 ? shuffleWithIndex(opts, ci) : { options: opts, correctIndex: ci };
      return {
        difficulty: levels[i],
        question: clean(q.question),
        options: sh.options,
        correctIndex: sh.correctIndex,
        explanation: clean(q.explanation)
      };
    });

    return { data: d, problems: problems };
  }

  /* ---------- build prompt (own-key mode) ---------- */
  function buildPrompt(title, fixHint) {
    var t = clean(title).replace(/<<<|>>>/g, '').slice(0, 160);
    var fix = fixHint
      ? '\nPREVIOUS ATTEMPT HAD THESE PROBLEMS - FIX THEM: ' + clean(fixHint).slice(0, 300) + '\n'
      : '';
    return root.GD_PROMPT_TEMPLATE.replace('{{TITLE}}', function () {
      return t;
    }).replace('{{FIX}}', function () {
      return fix;
    });
  }

  /* ---------- transport ---------- */
  function friendlyHttp(code, msg) {
    if (code === 400 && /API key/i.test(msg || '')) return 'Gemini API key galat hai. Settings me check karein.';
    if (code === 401 || code === 403) return 'API key allowed nahi hai ya galat hai. Settings me dobara check karein.';
    if (code === 429) return 'Free limit ya speed limit ho gayi. Thodi der ruk kar try karein.';
    if (code >= 500) return 'Google AI server busy hai. Thodi der baad try karein.';
    if (code === 404) return 'Ye model aapki key par available nahi hai. Settings me "Available models dekhein" se sahi model chunein.';
    return 'AI error (' + code + ')' + (msg ? ': ' + msg : '');
  }

  async function callOwnKey(apiKey, title, fixHint, modelOverride) {
    var models = dedupe(
      [modelOverride || CFG.DEFAULT_MODEL].concat(CFG.FALLBACK_MODELS || []).concat(BUILTIN_MODELS).filter(Boolean)
    );
    var tried = [];
    var prompt = buildPrompt(title, fixHint);
    var lastErr = null;
    for (var i = 0; i < models.length; i++) {
      var url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(models[i]) +
        ':generateContent';
      var res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              responseMimeType: 'application/json',
              maxOutputTokens: 8192
            }
          })
        });
      } catch (e) {
        throw new Error('Internet connection check karein.');
      }
      var body = null;
      try {
        body = await res.json();
      } catch (e) {}
      if (res.ok) {
        var parts =
          body && body.candidates && body.candidates[0] && body.candidates[0].content
            ? body.candidates[0].content.parts || []
            : [];
        var txt = parts
          .map(function (p) {
            return p.text || '';
          })
          .join('');
        if (txt) return { text: txt, model: models[i] };
        lastErr = new Error('AI ne khaali response diya. Title thoda badal kar try karein.');
        continue;
      }
      var msg = body && body.error && body.error.message ? body.error.message : '';
      lastErr = new Error(friendlyHttp(res.status, msg));
      tried.push(models[i] + ': ' + res.status + (msg ? ' ' + clean(msg).slice(0, 110) : ''));
      // model nahi mila / rate limit -> next model try
      if (res.status === 404 || res.status === 429 || res.status === 400) {
        if (res.status === 400 && /API key/i.test(msg)) throw lastErr;
        continue;
      }
      throw lastErr;
    }
    if (lastErr && tried.length) lastErr = new Error(lastErr.message + ' [' + tried.join(' | ').slice(0, 380) + ']');
    throw lastErr || new Error('AI response nahi mila.');
  }

  async function listModels(apiKey) {
    var out = [];
    var token = '';
    for (var p = 0; p < 5; p++) {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
      var res;
      try {
        res = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
      } catch (e) {
        throw new Error('Internet connection check karein.');
      }
      var body = null;
      try { body = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error(friendlyHttp(res.status, body && body.error && body.error.message));
      (body.models || []).forEach(function (m) {
        var id = String(m.name || '').replace(/^models\//, '');
        var methods = m.supportedGenerationMethods || [];
        if (methods.indexOf('generateContent') < 0) return;
        if (!/^gemini-/.test(id)) return;
        if (/image|tts|live|audio|embedding|robotics|computer-use|transcribe|veo|imagen/i.test(id)) return;
        out.push(id);
      });
      token = body.nextPageToken || '';
      if (!token) break;
    }
    return out;
  }

  async function callShared(token, title, fixHint) {
    if (!CFG.APPS_SCRIPT_URL || /PASTE_/.test(CFG.APPS_SCRIPT_URL)) {
      throw new Error('Shared AI setup pending hai. Settings me apni free Gemini key lagayein.');
    }
    var res;
    try {
      res = await fetch(CFG.APPS_SCRIPT_URL, {
        method: 'POST',
        // text/plain => preflight (OPTIONS) nahi hota, Apps Script ke liye zaruri
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'generate', token: token, title: title, fixHint: fixHint || '' })
      });
    } catch (e) {
      throw new Error('Server se connect nahi ho paya. Internet check karein.');
    }
    var out;
    try {
      out = await res.json();
    } catch (e) {
      throw new Error('Server ka response galat hai. Apps Script deployment check karein.');
    }
    if (!out.ok) throw new Error(out.error || 'Server error');
    return out; // {text, model, remaining, dailyLimit}
  }

  /* ---------- public: generate full package ---------- */
  // opts: { mode:'shared'|'own', apiKey, token, model }
  async function generatePackage(title, opts) {
    title = clean(title);
    if (!title) throw new Error('Pehle video title likhein.');
    if (title.length > 160) throw new Error('Title 160 characters se chhota rakhein.');

    var meta = {};
    var fix = '';
    var lastProblems = [];
    for (var attempt = 0; attempt < 2; attempt++) {
      var out;
      if (opts.mode === 'shared') out = await callShared(opts.token, title, fix);
      else out = await callOwnKey(opts.apiKey, title, fix, opts.model);
      meta = { model: out.model, remaining: out.remaining, dailyLimit: out.dailyLimit };
      var parsed;
      try {
        parsed = parseJson(out.text);
      } catch (e) {
        fix = 'return strictly valid JSON only';
        lastProblems = ['invalid JSON'];
        continue;
      }
      var n = normalize(parsed, title);
      if (!n.problems.length) return { data: n.data, meta: meta };
      lastProblems = n.problems;
      fix = n.problems.join('; ');
    }
    throw new Error('AI ne poora format nahi diya (' + lastProblems.slice(0, 2).join(', ') + '). Dobara Generate dabayein.');
  }

  /* ---------- final copy-paste output (exact order of master prompt) ---------- */
  function toMarkdown(d) {
    var L = 'ABCD';
    var lines = [];
    lines.push('# 🎬 YOUTUBE CONTENT PACKAGE', '', '## Video Topic', d.topic, '');
    lines.push('## 1. SEO-Friendly Titles');
    d.titles.slice(0, 3).forEach(function (t, i) {
      lines.push(i + 1 + '. ' + t.text);
    });
    lines.push('', '### Best Recommended Title', d.titles[d.bestTitleIndex].text, '');
    lines.push('## 2. Short YouTube Description', d.description, '');
    lines.push('## 3. Tags / Hashtags', d.hashtags.join(' '), '');
    lines.push('## 4. SEO Keywords', d.keywords.join(', '), '');
    lines.push('## 5. Thumbnail', 'Size: 1280 × 720 px', 'Thumbnail Text:', d.thumbnail.text);
    lines.push('Visual Concept:', d.thumbnail.visualConcept, '');
    lines.push('## 6. Quiz Questions', '');
    var heads = ['### Question 1 – Easy', '### Question 2 – Medium', '### Question 3 – Tricky / Concept-Based'];
    d.quiz.forEach(function (q, i) {
      lines.push(heads[i], 'Question:', q.question);
      q.options.forEach(function (o, k) {
        lines.push(L[k] + '. ' + o);
      });
      lines.push('', 'Correct Answer: ' + L[q.correctIndex] + '. ' + q.options[q.correctIndex]);
      lines.push('Explanation: ' + q.explanation, '');
    });
    return lines.join('\n').trim() + '\n';
  }

  function quizToText(q, i) {
    var L = 'ABCD';
    var s = 'Question ' + (i + 1) + ' – ' + q.difficulty + '\nQuestion: ' + q.question + '\n';
    q.options.forEach(function (o, k) {
      s += L[k] + '. ' + o + '\n';
    });
    s += 'Correct Answer: ' + L[q.correctIndex] + '. ' + q.options[q.correctIndex] + '\nExplanation: ' + q.explanation;
    return s;
  }

  var API = {
    generatePackage: generatePackage,
    listModels: listModels,
    normalize: normalize,
    parseJson: parseJson,
    buildPrompt: buildPrompt,
    toMarkdown: toMarkdown,
    quizToText: quizToText,
    clean: clean,
    wordCount: wordCount
  };
  root.GDAI = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

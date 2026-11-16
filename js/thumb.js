/* ==========================================================
   Thumbnail renderer - exactly 1280 x 720 px (16:9), canvas based.
   AI deta hai: headline text, emoji, layout, palette.
   Yeh file design + GD TECH ACADEMY branding draw karti hai.
   ========================================================== */
(function (root) {
  var W = 1280;
  var H = 720;

  var PRESETS = {
    brand: { name: 'GD Brand', bg1: '#0B1F4A', bg2: '#007F8C', accent: '#FFB703', text: '#FFFFFF' },
    sunset: { name: 'Sunset', bg1: '#3B0A45', bg2: '#C2410C', accent: '#FFD166', text: '#FFFFFF' },
    tech: { name: 'Tech Purple', bg1: '#1E1B4B', bg2: '#6D28D9', accent: '#22D3EE', text: '#FFFFFF' },
    green: { name: 'Fresh Green', bg1: '#052E2B', bg2: '#15803D', accent: '#FDE047', text: '#FFFFFF' },
    red: { name: 'Bold Red', bg1: '#1F1235', bg2: '#B91C1C', accent: '#FBBF24', text: '#FFFFFF' }
  };

  function hexToRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function luminance(h) {
    var c = hexToRgb(h).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function rgba(h, a) {
    var c = hexToRgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  // AI palette tabhi use hota hai jab readable (dark bg, bright accent) ho
  function resolvePalette(key, aiPal) {
    if (key && key !== 'ai' && PRESETS[key]) return PRESETS[key];
    var p = aiPal || {};
    var ok =
      p.bg1 && p.bg2 && p.accent && p.text &&
      luminance(p.bg1) < 0.12 && luminance(p.bg2) < 0.22 &&
      luminance(p.accent) > 0.35 && luminance(p.text) > 0.7;
    return ok ? p : PRESETS.brand;
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      var img = new Image();
      img.onload = function () { finish(img); };
      img.onerror = function () { finish(null); };
      setTimeout(function () { finish(null); }, 4000); // kabhi atke nahi
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var FONT = '"Poppins","Segoe UI","Noto Sans",Roboto,Arial,sans-serif';
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  // headline ko max 3 lines me todo
  function splitLines(words, maxLines) {
    if (words.length <= 2) return [words.join(' ')];
    var n = Math.min(maxLines, words.length <= 3 ? 2 : 3);
    if (words.length === 3) n = 2;
    var per = Math.ceil(words.length / n);
    var lines = [];
    for (var i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(' '));
    return lines;
  }

  function fitFont(ctx, lines, maxW, maxFont, minFont, weight) {
    for (var size = maxFont; size >= minFont; size -= 2) {
      ctx.font = weight + ' ' + size + 'px ' + FONT;
      var widest = 0;
      for (var i = 0; i < lines.length; i++) widest = Math.max(widest, ctx.measureText(lines[i]).width);
      if (widest <= maxW) return size;
    }
    return minFont;
  }

  function background(ctx, pal, layout) {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, pal.bg1);
    g.addColorStop(1, pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // dotted tech grid
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (var x = 24; x < W; x += 40) for (var y = 24; y < H; y += 40) ctx.fillRect(x, y, 3, 3);

    // glow circles
    var r1 = ctx.createRadialGradient(W * 0.85, H * 0.3, 20, W * 0.85, H * 0.3, 480);
    r1.addColorStop(0, rgba(pal.accent, 0.35));
    r1.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = r1;
    ctx.fillRect(0, 0, W, H);

    if (layout === 'split') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W * 0.64, 0);
      ctx.lineTo(W * 0.52, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
    }
    // accent stripe (bottom)
    ctx.fillStyle = pal.accent;
    ctx.fillRect(0, H - 14, W, 14);
    ctx.fillStyle = rgba('#FFFFFF', 0.25);
    ctx.fillRect(0, H - 14, W * 0.35, 14);
  }

  function drawMascot(ctx, img, cx, bottom, height, pal) {
    if (!img) return;
    var w = (img.width * height) / img.height;
    // glow disc
    var rad = height * 0.62;
    var gd = ctx.createRadialGradient(cx, bottom - height * 0.5, 10, cx, bottom - height * 0.5, rad);
    gd.addColorStop(0, rgba('#FFFFFF', 0.28));
    gd.addColorStop(1, rgba('#FFFFFF', 0));
    ctx.fillStyle = gd;
    ctx.beginPath();
    ctx.arc(cx, bottom - height * 0.5, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(img, cx - w / 2, bottom - height, w, height);
    ctx.restore();
  }

  function drawEmoji(ctx, list, positions) {
    if (!list || !list.length) return;
    list.slice(0, positions.length).forEach(function (e, i) {
      var p = positions[i];
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = Math.round(p.r * 1.15) + 'px ' + EMOJI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(e, p.x, p.y + p.r * 0.06);
      ctx.restore();
    });
  }

  function drawHeadline(ctx, text, box, pal, align) {
    var words = text.toUpperCase().split(' ').filter(Boolean);
    var lines = splitLines(words, 3);
    var size = fitFont(ctx, lines, box.w, lines.length === 1 ? 150 : 128, 56, 800);
    var lh = size * 1.08;
    var total = lh * lines.length;
    var y0 = box.y + (box.h - total) / 2 + lh / 2;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    var x = align === 'center' ? box.x + box.w / 2 : box.x;
    lines.forEach(function (ln, i) {
      var y = y0 + i * lh;
      var isAccent = lines.length > 1 && i === lines.length - 1;
      ctx.font = '800 ' + size + 'px ' + FONT;
      ctx.lineWidth = Math.max(8, size * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(ln, x, y + 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(ln, x, y);
      ctx.fillStyle = isAccent ? pal.accent : pal.text;
      ctx.fillText(ln, x, y);
    });
    return { bottom: y0 + (lines.length - 0.5) * lh, size: size };
  }

  function drawPill(ctx, text, x, y, pal, align) {
    if (!text) return;
    ctx.font = '700 36px ' + FONT;
    var w = ctx.measureText(text).width + 56;
    var h = 66;
    var left = align === 'center' ? x - w / 2 : x;
    roundRect(ctx, left, y, w, h, 33);
    ctx.fillStyle = pal.accent;
    ctx.fill();
    ctx.fillStyle = '#0B1F4A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + 28, y + h / 2 + 2);
  }

  function drawBrand(ctx, logo) {
    var x = 40, y = 40;
    ctx.font = '700 28px ' + FONT;
    var label = 'GD TECH ACADEMY';
    var w = ctx.measureText(label).width + (logo ? 66 : 30);
    roundRect(ctx, x, y, w, 58, 29);
    ctx.fillStyle = 'rgba(8,16,40,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    var tx = x + 18;
    if (logo) {
      ctx.save();
      roundRect(ctx, x + 8, y + 7, 44, 44, 12);
      ctx.clip();
      ctx.drawImage(logo, x + 8, y + 7, 44, 44);
      ctx.restore();
      tx = x + 62;
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx, y + 30);
  }

  /**
   * render(spec, opts) -> Promise<canvas 1280x720>
   * spec: data.thumbnail  {text, subtext, emoji[], layout, palette}
   * opts: { palette:'ai'|key, layout:'ai'|'left'|'center'|'split', mascot:true, mascotSrc, logoSrc }
   */
  async function render(spec, opts) {
    opts = opts || {};
    try {
      if (root.document && root.document.fonts && root.document.fonts.load) {
        await Promise.all([
          root.document.fonts.load('800 80px Poppins'),
          root.document.fonts.load('700 30px Poppins')
        ]);
      }
    } catch (e) {}

    var canvas = root.document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Is browser me canvas support nahi hai');

    var pal = resolvePalette(opts.palette, spec.palette);
    var layout = opts.layout && opts.layout !== 'ai' ? opts.layout : spec.layout || 'left';
    var showMascot = opts.mascot !== false;

    var imgs = await Promise.all([
      showMascot ? loadImage(opts.mascotSrc || 'icons/mascot.png') : Promise.resolve(null),
      loadImage(opts.logoSrc || 'icons/icon-192.png')
    ]);
    var mascot = imgs[0];
    var logo = imgs[1];

    background(ctx, pal, layout);

    var emoji = spec.emoji || [];
    var hasMascot = !!mascot;

    if (layout === 'center') {
      drawEmoji(ctx, emoji, hasMascot
        ? [{ x: 1150, y: 170, r: 62 }, { x: 960, y: 290, r: 46 }]
        : [{ x: 150, y: 600, r: 70 }, { x: 1130, y: 190, r: 62 }, { x: 1120, y: 560, r: 56 }]);
      if (hasMascot) drawMascot(ctx, mascot, 1070, 740, 460, pal);
      var hb = drawHeadline(ctx, spec.text, { x: 90, y: 130, w: hasMascot ? 820 : 1100, h: 360 }, pal, hasMascot ? 'left' : 'center');
      drawPill(ctx, spec.subtext, hasMascot ? 90 : W / 2, hb.bottom + 22, pal, hasMascot ? 'left' : 'center');
    } else {
      // left / split : text left, mascot right
      var textBox = { x: 60, y: 120, w: hasMascot ? 700 : 1000, h: 390 };
      var hb2 = drawHeadline(ctx, spec.text, textBox, pal, 'left');
      drawPill(ctx, spec.subtext, 60, Math.min(hb2.bottom + 20, 560), pal, 'left');
      if (hasMascot) {
        drawMascot(ctx, mascot, 1010, 745, 560, pal);
        drawEmoji(ctx, emoji, [
          { x: 850, y: 140, r: 56 },
          { x: 1205, y: 190, r: 52 },
          { x: 830, y: 560, r: 48 }
        ]);
      } else {
        drawEmoji(ctx, emoji, [
          { x: 1090, y: 220, r: 110 },
          { x: 1000, y: 470, r: 80 },
          { x: 1170, y: 520, r: 60 }
        ]);
      }
    }

    drawBrand(ctx, logo);
    return canvas;
  }

  function toBlob(canvas) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, 'image/png');
      else resolve(null);
    });
  }

  var API = { render: render, toBlob: toBlob, PRESETS: PRESETS, W: W, H: H, resolvePalette: resolvePalette };
  root.GDThumb = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

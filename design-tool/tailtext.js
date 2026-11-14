/* BAAN BOW — tail lettering that follows the ribbon.
 *
 * The tails of a bow laid over a bonnet are not straight: they bend as the
 * fabric falls. Setting the text on one rotated baseline left it floating
 * across the ribbon rather than lying on it.
 *
 * drawTextOnPath() sets a line along a quadratic curve. It deliberately does
 * NOT place the text glyph by glyph: the shop writes in Thai, where vowels and
 * tone marks hang above and below the consonant they belong to, and splitting
 * a string into code points scatters them. Instead the whole line is laid out
 * flat once — so the browser does all the Thai shaping — and that bitmap is
 * then bent, one narrow column at a time, along the curve. Columns are stepped
 * by arc length so the letters keep their spacing through the bend.
 */
(function (global) {
  'use strict';

  function qPoint(P, t) {
    var u = 1 - t;
    return [u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0],
            u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1]];
  }

  function qTangent(P, t) {
    var u = 1 - t;
    return [2 * u * (P[1][0] - P[0][0]) + 2 * t * (P[2][0] - P[1][0]),
            2 * u * (P[1][1] - P[0][1]) + 2 * t * (P[2][1] - P[1][1])];
  }

  /* Sampled arc-length table, so a distance along the ribbon maps back to a
   * curve parameter. Without it the lettering bunches up where the curve
   * bends hardest. */
  function arcTable(P, n) {
    var ss = new Float64Array(n + 1);
    var prev = qPoint(P, 0), s = 0;
    for (var i = 1; i <= n; i++) {
      var pt = qPoint(P, i / n);
      s += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      ss[i] = s;
      prev = pt;
    }
    return { ss: ss, n: n, len: s };
  }

  function tAtLength(tab, s) {
    if (s <= 0) return 0;
    if (s >= tab.len) return 1;
    var ss = tab.ss, lo = 0, hi = tab.n;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (ss[mid] <= s) lo = mid; else hi = mid;
    }
    var span = ss[hi] - ss[lo];
    return (lo + (span ? (s - ss[lo]) / span : 0)) / tab.n;
  }

  var measurer = null;
  function measure(text, font) {
    if (!measurer) measurer = document.createElement('canvas').getContext('2d');
    measurer.font = font;
    return measurer.measureText(text).width;
  }

  /* ctx    — destination 2d context
   * text   — one line
   * P      — [[x,y],[x,y],[x,y]] quadratic control points, in ctx pixels
   * o      — family, weight, color, maxFontPx, minFontPx,
   *          fit (fraction of the curve the line may fill),
   *          offset (pixels perpendicular to the curve, + is "below"),
   *          shadow, step (column width; 2 is plenty for a preview)
   */
  function drawTextOnPath(ctx, text, P, o) {
    text = (text == null ? '' : String(text)).trim();
    if (!text) return;
    o = o || {};
    var family = o.family || 'serif';
    var weight = o.weight || 600;
    var fontAt = function (px) { return weight + ' ' + px + 'px ' + family; };

    var tab = arcTable(P, 220);
    if (!(tab.len > 1)) return;

    var fs = o.maxFontPx || 24;
    var minFs = o.minFontPx || 8;
    var width = measure(text, fontAt(fs));
    var avail = tab.len * (o.fit == null ? 0.78 : o.fit);
    if (width > avail) {
      fs = Math.max(minFs, fs * avail / width);
      width = measure(text, fontAt(fs));
    }

    // Lay the line out flat. The padding leaves room for Thai marks above and
    // below, and for the shadow, so nothing is clipped when the strip is bent.
    var pad = Math.ceil(fs * 0.6);
    var fw = Math.ceil(width) + pad * 2;
    var fh = Math.ceil(fs * 2.2) + pad * 2;
    var flat = document.createElement('canvas');
    flat.width = fw; flat.height = fh;
    var fc = flat.getContext('2d');
    fc.font = fontAt(fs);
    fc.textAlign = 'left';
    fc.textBaseline = 'middle';
    fc.fillStyle = o.color || '#000';
    if (o.shadow !== false) {
      fc.shadowColor = 'rgba(0,0,0,.30)';
      fc.shadowBlur = fs * 0.12;
      fc.shadowOffsetY = fs * 0.04;
    }
    fc.fillText(text, pad, fh / 2);

    // Bend it. Each column is drawn a shade wider than it is sampled, which
    // closes the hairline seams that rotation would otherwise open up.
    var step = o.step || 1;
    var dst = step + 0.7;
    var start = (tab.len - width) / 2 - pad;
    var offset = o.offset || 0;
    for (var x = 0; x < fw; x += step) {
      var s = start + x + step / 2;
      if (s < -step || s > tab.len + step) continue;
      var t = tAtLength(tab, s < 0 ? 0 : (s > tab.len ? tab.len : s));
      var pt = qPoint(P, t), tg = qTangent(P, t);
      ctx.save();
      ctx.translate(pt[0], pt[1]);
      ctx.rotate(Math.atan2(tg[1], tg[0]));
      ctx.drawImage(flat, x, 0, step, fh, -dst / 2, -fh / 2 + offset, dst, fh);
      ctx.restore();
    }
  }

  global.drawTextOnPath = drawTextOnPath;
})(typeof window !== 'undefined' ? window : this);

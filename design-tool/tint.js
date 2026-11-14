/* BAAN BOW — fabric dyeing for the design tool.
 *
 * The hand-traced PNG masks are hard-edged polygons: every pixel is either
 * alpha 0 or alpha 255, and the polygon sits within a pixel or two of the real
 * bow. Painting a flat colour through that mask left two artefacts — a pale
 * rim where the bow's own bright edge pixels fell outside the polygon, and
 * colour spilling onto the car where the polygon overshot.
 *
 * buildFabricMatte() replaces the hard polygon with a soft matte: the polygon
 * is only trusted a couple of pixels in from its own edge, and inside that
 * boundary band each pixel is classified from the photograph itself, by
 * projecting its colour onto the line between the local fabric colour and the
 * local background colour. The result follows the real silhouette with
 * sub-pixel coverage, so the dye neither leaves a white fringe nor runs over
 * the edge.
 *
 * dyeInto() then recolours through that matte. Rather than multiplying the
 * cream fabric by the chosen colour (which keeps the cream's yellow cast and
 * flattens the folds), it rebuilds each pixel from its own luminance: shade
 * below the fabric's reference brightness, and a push towards white above it,
 * so highlights and shadows survive the dye.
 */
(function (global) {
  'use strict';

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function rasterize(w, h, draw) {
    var c = makeCanvas(w, h);
    var x = c.getContext('2d', { willReadFrequently: true });
    draw(x, c);
    return x.getImageData(0, 0, w, h);
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // Tuning. All distances are in source-image pixels.
  var EDGE_BLUR = 2.5;   // softening applied to the hard polygon
  var REACH_BLUR = 6;    // wider softening, sets how far outside the polygon we may look
  var MEAN_BLUR = 10;    // radius the local fabric/background colours average over
  var IN_LO = 0.80, IN_SPAN = 0.18;    // "certainly fabric" cut on the blurred polygon
  // The outward reach has to clear the black outline painted just inside the
  // bow's edge, so that the pale piping beyond it is reached too.
  var OUT_LO = 0.06, OUT_SPAN = 0.17;  // "certainly not fabric" cut
  var AA_LO = 0.215, AA_SPAN = 0.32;   // fallback edge, biased ~1px outwards
  var CONTRAST_MIN = 0.06;             // below this the two local colours are too alike to trust
  var CONTRAST_SPAN = 0.10;
  var HILIGHT_SPAN = 0.45;             // how far above the reference luminance reaches pure white

  var TRIM_GAP = 5;                    // half the widest line the trim detector will bridge
  var TRIM_DARK_LO = 0.16, TRIM_DARK_HI = 0.36;  // luminance: fully trim below, never above
  var TRIM_THICK = 4;                  // dark runs wider than 2*this+1 px are holes, not ribbon
  var TRIM_FLOOD = 30;                 // how far a hole's rejection spreads through dark pixels

  function parseHex(hex) {
    var s = String(hex || '').trim().replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* Build the matte + shading data for one scene. Expensive (a handful of
   * full-image passes), so callers should cache it per scene. */
  function buildFabricMatte(baseImg, maskImg, w, h) {
    var N = w * h;
    var base = rasterize(w, h, function (x) { x.drawImage(baseImg, 0, 0, w, h); });
    var B = base.data;

    var MB = rasterize(w, h, function (x) {
      x.filter = 'blur(' + EDGE_BLUR + 'px)';
      x.drawImage(maskImg, 0, 0, w, h);
    }).data;
    var MR = rasterize(w, h, function (x) {
      x.filter = 'blur(' + REACH_BLUR + 'px)';
      x.drawImage(maskImg, 0, 0, w, h);
    }).data;

    // Soft erosion / dilation of the polygon, straddling its hard edge.
    var aIn = new Float32Array(N), aOut = new Float32Array(N), aAA = new Float32Array(N);
    var p, i, ab;
    for (p = 0, i = 3; p < N; p++, i += 4) {
      ab = MB[i] / 255;
      aIn[p] = clamp01((ab - IN_LO) / IN_SPAN);
      aAA[p] = clamp01((ab - AA_LO) / AA_SPAN);
      aOut[p] = clamp01((MR[i] / 255 - OUT_LO) / OUT_SPAN);
    }

    // Local mean colour of the fabric and of the background around it. Drawing
    // the photo with the weight as its alpha and then blurring gives, once the
    // canvas un-premultiplies, exactly the weighted average we want.
    function localMean(weights, invert) {
      var id = new ImageData(w, h), d = id.data;
      for (var q = 0, j = 3; q < N; q++, j += 4) {
        d[j] = (invert ? 1 - weights[q] : weights[q]) * 255;
      }
      var wc = makeCanvas(w, h);
      wc.getContext('2d').putImageData(id, 0, 0);
      var masked = makeCanvas(w, h);
      var mx = masked.getContext('2d');
      mx.drawImage(baseImg, 0, 0, w, h);
      mx.globalCompositeOperation = 'destination-in';
      mx.drawImage(wc, 0, 0);
      return rasterize(w, h, function (x) {
        x.filter = 'blur(' + MEAN_BLUR + 'px)';
        x.drawImage(masked, 0, 0);
      }).data;
    }
    var CI = localMean(aIn, false);
    var CO = localMean(aOut, true);

    var A = new Float32Array(N);
    var L = new Float32Array(N);
    var x0 = w, y0 = h, x1 = -1, y1 = -1;

    for (p = 0, i = 0; p < N; p++, i += 4) {
      L[p] = (0.2126 * B[i] + 0.7152 * B[i + 1] + 0.0722 * B[i + 2]) / 255;
      var lo = aIn[p], hi = aOut[p], a;
      if (lo >= 0.999) {
        a = 1;
      } else if (hi <= 0.001) {
        a = 0;
      } else {
        // Boundary band: let the photograph decide.
        var dr = (CI[i] - CO[i]) / 255,
            dg = (CI[i + 1] - CO[i + 1]) / 255,
            db = (CI[i + 2] - CO[i + 2]) / 255;
        var len2 = dr * dr + dg * dg + db * db;
        var t = aAA[p];
        if (len2 > CONTRAST_MIN * CONTRAST_MIN) {
          var cr = (B[i] - CO[i]) / 255,
              cg = (B[i + 1] - CO[i + 1]) / 255,
              cb = (B[i + 2] - CO[i + 2]) / 255;
          var proj = clamp01((cr * dr + cg * dg + cb * db) / len2);
          var conf = clamp01((Math.sqrt(len2) - CONTRAST_MIN) / CONTRAST_SPAN);
          t = t + (proj - t) * conf;
        }
        a = lo + (hi - lo) * t;
      }
      A[p] = a;
      if (a > 0.002) {
        var py = (p / w) | 0, px = p - py * w;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
    }

    // Reference brightness of the fabric: the 93rd percentile inside the
    // trusted core, so folds read as shade and sheen reads as highlight.
    var samples = [];
    for (p = 0; p < N; p += 3) if (aIn[p] > 0.9) samples.push(L[p]);
    samples.sort(function (m, n) { return m - n; });
    var Lref = samples.length ? samples[Math.floor(samples.length * 0.93)] : 0.8;
    if (Lref < 0.05) Lref = 0.05;

    if (x1 < 0) { x0 = y0 = 0; x1 = w - 1; y1 = h - 1; }

    // Grow the box so the ribbon trim that runs just outside the fabric
    // matte (between the cloth and its pale piping) is inside it too.
    x0 = Math.max(0, x0 - TRIM_GAP - 1); y0 = Math.max(0, y0 - TRIM_GAP - 1);
    x1 = Math.min(w - 1, x1 + TRIM_GAP + 1); y1 = Math.min(h - 1, y1 + TRIM_GAP + 1);
    var box = [x0, y0, x1, y1];

    // The ribbon trim: the black lines stitched onto the bow. They are the
    // pixels that are (a) nearly black and (b) hemmed in by fabric — which is
    // what a morphological closing of the fabric matte fills in. Closing
    // bridges gaps up to twice TRIM_GAP wide, so the thin lines are caught
    // while the dark windscreen seen through the loops, and the shadow under
    // the car beyond the silhouette, are left alone.
    var closed = extreme(extreme(A, w, box, TRIM_GAP, true), w, box, TRIM_GAP, false);
    // Brightness of the cloth beside each line, so the trim sits in the same
    // light as the fold it crosses.
    var near = extreme(L, w, box, TRIM_GAP, true);
    var T = new Float32Array(N), S = new Float32Array(N);
    var dark0 = TRIM_DARK_LO * Lref / 0.85, dark1 = TRIM_DARK_HI * Lref / 0.85;
    var yy, xx, q;
    for (yy = y0; yy <= y1; yy++) {
      for (xx = x0, q = yy * w + x0; xx <= x1; xx++, q++) {
        var c = closed[q];
        if (c <= 0.002) continue;
        var dk = 1 - clamp01((L[q] - dark0) / (dark1 - dark0));
        if (dk <= 0) continue;
        T[q] = c * dk * dk * (3 - 2 * dk);
        S[q] = Math.max(0.45, Math.min(1.08, near[q] / Lref));
      }
    }

    // Darkness alone also catches the slots where the windscreen shows
    // through the loops. Those are fat where the trim is thin: erode the dark
    // map until only cores wider than a ribbon line survive, then flood back
    // out from each core through the dark pixels (a bounded distance, so a
    // trim line that happens to touch a slot loses only its first stretch)
    // and strike everything reached.
    var core = extreme(T, w, box, TRIM_THICK, false);
    var dist = new Int16Array(N), queue = new Int32Array(N), head = 0, tail = 0;
    for (yy = y0; yy <= y1; yy++) {
      for (xx = x0, q = yy * w + x0; xx <= x1; xx++, q++) {
        if (core[q] > 0.5) { dist[q] = 1; queue[tail++] = q; }
      }
    }
    var steps = [-1, 1, -w, w];
    while (head < tail) {
      var cur = queue[head++], d = dist[cur];
      if (d > TRIM_FLOOD) continue;
      for (var si = 0; si < 4; si++) {
        var nb = cur + steps[si];
        if (nb < 0 || nb >= N || dist[nb] || T[nb] <= 0.05) continue;
        dist[nb] = d + 1; queue[tail++] = nb;
      }
    }
    for (q = 0; q < tail; q++) T[queue[q]] = 0;

    return { w: w, h: h, B: B, A: A, L: L, Lref: Lref, T: T, S: S, box: box };
  }

  /* Separable max (dilate) or min (erode) filter over the box, square
   * footprint of the given radius. Returns a new array; pixels outside the
   * box are zero. */
  function extreme(src, w, box, r, isMax) {
    var x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
    var tmp = new Float32Array(src.length), dst = new Float32Array(src.length);
    var x, y, k, v, m, a, b;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        a = x - r < x0 ? x0 : x - r; b = x + r > x1 ? x1 : x + r;
        m = src[y * w + a];
        for (k = a + 1; k <= b; k++) { v = src[y * w + k]; if (isMax ? v > m : v < m) m = v; }
        tmp[y * w + x] = m;
      }
    }
    for (y = y0; y <= y1; y++) {
      a = y - r < y0 ? y0 : y - r; b = y + r > y1 ? y1 : y + r;
      for (x = x0; x <= x1; x++) {
        m = tmp[a * w + x];
        for (k = a + 1; k <= b; k++) { v = tmp[k * w + x]; if (isMax ? v > m : v < m) m = v; }
        dst[y * w + x] = m;
      }
    }
    return dst;
  }

  /* Paint the dyed image into ctx (which must be sized to the matte).
   * tint — fabric colour, or null to leave the cloth as photographed.
   * trim — ribbon-trim colour, or null to leave the lines black. */
  function dyeInto(ctx, matte, tint, trim) {
    var w = matte.w, h = matte.h, B = matte.B, A = matte.A, L = matte.L, Lref = matte.Lref;
    var T = matte.T, S = matte.S;
    var out = ctx.createImageData(w, h);
    var o = out.data;
    o.set(B);
    if (tint || trim) {
      var t = tint ? parseHex(tint) : null, tr = 0, tg = 0, tb = 0;
      if (t) { tr = t[0]; tg = t[1]; tb = t[2]; }
      var r = trim ? parseHex(trim) : null;
      var box = matte.box;
      for (var y = box[1]; y <= box[3]; y++) {
        var row = y * w;
        for (var x = box[0]; x <= box[2]; x++) {
          var p = row + x, a = t ? A[p] : 0, tm = r ? T[p] : 0;
          if (a <= 0.002 && tm <= 0.002) continue;
          var i = p * 4;
          var cr = B[i], cg = B[i + 1], cb = B[i + 2];
          if (a > 0.002) {
            var k = L[p] / Lref, dr, dg, db;
            if (k <= 1) {
              dr = tr * k; dg = tg * k; db = tb * k;
            } else {
              var e = Math.min(1, (k - 1) / HILIGHT_SPAN);
              dr = tr + (1 - tr) * e; dg = tg + (1 - tg) * e; db = tb + (1 - tb) * e;
            }
            cr += (dr * 255 - cr) * a;
            cg += (dg * 255 - cg) * a;
            cb += (db * 255 - cb) * a;
          }
          if (tm > 0.002) {
            var s = S[p] * 255;
            cr += (r[0] * s - cr) * tm;
            cg += (r[1] * s - cg) * tm;
            cb += (r[2] * s - cb) * tm;
          }
          o[i] = cr; o[i + 1] = cg; o[i + 2] = cb; o[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  global.buildFabricMatte = buildFabricMatte;
  global.dyeInto = dyeInto;
})(typeof window !== 'undefined' ? window : this);

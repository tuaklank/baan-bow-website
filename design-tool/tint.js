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

    return { w: w, h: h, B: B, A: A, L: L, Lref: Lref,
             box: [x0, y0, Math.min(w - 1, x1), Math.min(h - 1, y1)] };
  }

  /* Paint the dyed image into ctx (which must be sized to the matte). */
  function dyeInto(ctx, matte, tint) {
    var w = matte.w, h = matte.h, B = matte.B, A = matte.A, L = matte.L, Lref = matte.Lref;
    var out = ctx.createImageData(w, h);
    var o = out.data;
    o.set(B);
    if (tint) {
      var t = parseHex(tint), tr = t[0], tg = t[1], tb = t[2];
      var box = matte.box;
      for (var y = box[1]; y <= box[3]; y++) {
        var row = y * w;
        for (var x = box[0]; x <= box[2]; x++) {
          var p = row + x, a = A[p];
          if (a <= 0.002) continue;
          var i = p * 4;
          var k = L[p] / Lref, dr, dg, db;
          if (k <= 1) {
            dr = tr * k; dg = tg * k; db = tb * k;
          } else {
            var e = Math.min(1, (k - 1) / HILIGHT_SPAN);
            dr = tr + (1 - tr) * e; dg = tg + (1 - tg) * e; db = tb + (1 - tb) * e;
          }
          o[i] = B[i] + (dr * 255 - B[i]) * a;
          o[i + 1] = B[i + 1] + (dg * 255 - B[i + 1]) * a;
          o[i + 2] = B[i + 2] + (db * 255 - B[i + 2]) * a;
          o[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  global.buildFabricMatte = buildFabricMatte;
  global.dyeInto = dyeInto;
})(typeof window !== 'undefined' ? window : this);

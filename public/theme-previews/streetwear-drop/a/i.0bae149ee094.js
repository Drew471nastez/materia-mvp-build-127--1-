try{(function installCoverTrim(doc, win) {
  var w = win;
  if (w.__slCoverTrim) return;
  var PADDED = /_processed\.jpe?g/i;
  var shown = {};
  var waiting = {};
  var flat = function(px, width, at, column, length) {
    var min = 255;
    var max = 0;
    var chroma = 0;
    var sum = 0;
    for (var i = 0; i < length; i++) {
      var x = column ? at : i;
      var y = column ? i : at;
      var o = (y * width + x) * 4;
      var r = px[o];
      var g = px[o + 1];
      var b = px[o + 2];
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
      var c = Math.max(r, g, b) - Math.min(r, g, b);
      if (c > chroma) chroma = c;
      sum += lum;
    }
    var light = sum / Math.max(1, length);
    return [max - min <= 18 && chroma <= 14 && (light >= 196 || light <= 34), light];
  };
  var edge = function(px, width, height, column, fromEnd) {
    var count = column ? width : height;
    var length = column ? height : width;
    var run = 0;
    var light = 0;
    for (var k = 0; k < count; k++) {
      var line2 = flat(px, width, fromEnd ? count - 1 - k : k, column, length);
      if (!line2[0]) break;
      light = line2[1];
      run++;
    }
    return [run, light];
  };
  var sides = function(px, width, height, column) {
    var size = column ? width : height;
    var a = edge(px, width, height, column, false);
    var b = edge(px, width, height, column, true);
    if (!a[0] || !b[0]) return null;
    if (a[0] + b[0] >= size * 0.9) return null;
    if (Math.abs(a[0] - b[0]) > Math.max(2, size * 0.04)) return null;
    if (a[0] + b[0] < size * 0.06) return null;
    if (Math.abs(a[1] - b[1]) > 40) return null;
    var start = Math.min(size, a[0] + 1);
    var end = Math.max(start, size - b[0] - 1);
    return [start / size, (end - start) / size];
  };
  var find = function(px, width, height) {
    if (!(width >= 8) || !(height >= 8) || px.length < width * height * 4) return null;
    var across = sides(px, width, height, true);
    var down = sides(px, width, height, false);
    if (!across && !down) return null;
    var onlyAcross = !!across && !!down && 1 - across[1] >= 1 - down[1];
    var onlyDown = !!across && !!down && !onlyAcross;
    var box = { x: across && !onlyDown ? across[0] : 0, y: down && !onlyAcross ? down[0] : 0, w: across && !onlyDown ? across[1] : 1, h: down && !onlyAcross ? down[1] : 1 };
    if (box.w < 0.2 || box.h < 0.2) return null;
    return box;
  };
  w.__slCoverBox = find;
  w.__slCoverTrim = true;
  try {
    var style2 = doc.createElement("style");
    style2.setAttribute("data-sl-cover-trim", "");
    style2.textContent = 'html.sl-cover-trim img[src*="_processed."]:not([data-cover-trim]):not([data-cover-padded="keep"] img),html.sl-cover-trim img[data-cover-trim="busy"],html.sl-cover-trim img[data-cover-trim="done"][src*="_processed."]{opacity:0}';
    (doc.head || doc.documentElement).appendChild(style2);
    doc.documentElement.classList.add("sl-cover-trim");
  } catch {
  }
  var fullOf = function(src) {
    try {
      var u = new URL(src, doc.baseURI);
      if (u.pathname === "/_next/image") {
        var raw = u.searchParams.get("url");
        if (raw) return new URL(raw, doc.baseURI).href;
      }
      return u.href;
    } catch {
      return src;
    }
  };
  var settle2 = function(key, url) {
    shown[key] = url;
    var list = waiting[key] || [];
    delete waiting[key];
    for (var i = 0; i < list.length; i++) {
      var img = list[i];
      if (fullOf(img.currentSrc || img.src || "") === key) put(img, key, url);
      else {
        img.removeAttribute("data-cover-trim");
        look(img);
      }
    }
  };
  var put = function(img, key, url) {
    if (!url) {
      img.setAttribute("data-cover-trim", "none");
      img.setAttribute("data-cover-from", key);
      var fit = w.__slPicFitPaint;
      if (fit) fit(img);
      return;
    }
    var parent = img.parentNode;
    if (parent && parent.tagName === "PICTURE") {
      var sources = parent.getElementsByTagName("source");
      for (var i = 0; i < sources.length; i++) sources[i].removeAttribute("srcset");
    }
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.setAttribute("data-cover-trim", "done");
    img.setAttribute("data-cover-from", key);
    img.src = url;
  };
  var cut = function(key, fallback) {
    var fromImage = function(pic) {
      try {
        var nw = pic.naturalWidth;
        var nh = pic.naturalHeight;
        if (!(nw > 0 && nh > 0)) return false;
        var sw = Math.min(128, nw);
        var sh = Math.max(1, Math.round(sw * nh / nw));
        var small = doc.createElement("canvas");
        small.width = sw;
        small.height = sh;
        var sctx = small.getContext("2d", { willReadFrequently: true });
        if (!sctx) return false;
        sctx.drawImage(pic, 0, 0, sw, sh);
        var box = find(sctx.getImageData(0, 0, sw, sh).data, sw, sh);
        if (!box) {
          settle2(key, "");
          return true;
        }
        var cx = Math.round(box.x * nw);
        var cy = Math.round(box.y * nh);
        var cw = Math.max(1, Math.round(box.w * nw));
        var ch = Math.max(1, Math.round(box.h * nh));
        var big = doc.createElement("canvas");
        big.width = cw;
        big.height = ch;
        var bctx = big.getContext("2d");
        if (!bctx) return false;
        bctx.drawImage(pic, cx, cy, cw, ch, 0, 0, cw, ch);
        if (big.toBlob) {
          big.toBlob(
            function(blob) {
              if (!blob) return settle2(key, "");
              settle2(key, URL.createObjectURL(blob));
            },
            "image/jpeg",
            0.92
          );
        } else {
          settle2(key, big.toDataURL("image/jpeg", 0.92));
        }
        return true;
      } catch {
        return false;
      }
    };
    setTimeout(function() {
      if (waiting[key]) settle2(key, "");
    }, 4e3);
    var full = new Image();
    full.crossOrigin = "anonymous";
    full.decoding = "async";
    var readFrom = key;
    try {
      var at = new URL(key, doc.baseURI);
      var here = doc.location ? doc.location.origin : "";
      if (here && at.origin !== here && /^https?:$/.test(at.protocol)) readFrom = here + "/_next/image?url=" + encodeURIComponent(at.href) + "&w=1920&q=90";
    } catch {
      readFrom = key;
    }
    full.onload = function() {
      if (!fromImage(full) && !fromImage(fallback)) settle2(key, "");
    };
    full.onerror = function() {
      if (!fromImage(fallback)) settle2(key, "");
    };
    full.src = readFrom;
  };
  var look = function(img) {
    var src = img.currentSrc || img.src || "";
    if (!src || !PADDED.test(src)) return;
    var state = img.getAttribute("data-cover-trim");
    if (state === "keep" || state === "framed" || state === "busy") return;
    if (img.closest && img.closest('[data-cover-padded="keep"]')) {
      img.setAttribute("data-cover-trim", "keep");
      return;
    }
    var key = fullOf(src);
    if (state === "none" && img.getAttribute("data-cover-from") === key) return;
    if (shown[key] !== void 0) return put(img, key, shown[key]);
    img.setAttribute("data-cover-trim", "busy");
    if (waiting[key]) {
      waiting[key].push(img);
      return;
    }
    waiting[key] = [img];
    cut(key, img);
  };
  doc.addEventListener(
    "load",
    function(e) {
      var t = e.target;
      if (t && t.tagName === "IMG") look(t);
    },
    true
  );
  doc.addEventListener(
    "error",
    function(e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.getAttribute("data-cover-trim") !== "keep") t.setAttribute("data-cover-trim", "none");
    },
    true
  );
  var early = function() {
    var imgs = doc.images;
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete && imgs[i].naturalWidth > 0) look(imgs[i]);
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", early);
  else early();
})(document,window)}catch(e){}try{(function installPicFit(doc, win) {
  var w = win;
  if (w.__slPicFit) return;
  w.__slPicFit = true;
  var FRAMES = ".product-item__media--ratio,.media-gallery__image,[data-pic-frame]";
  var PADDED = /_processed\.jpe?g/i;
  var STOPS = 6;
  var edges = {};
  var reading = {};
  try {
    var style2 = doc.createElement("style");
    style2.setAttribute("data-sl-pic-fit", "");
    style2.textContent = "html.sl-pic-fit :is(" + FRAMES + ') img:not([data-pic-fit="off"]){object-fit:contain!important;object-position:50% 50%!important}html.sl-pic-fit img[data-pic-fit="band"]{background:var(--pf-bg)!important}';
    (doc.head || doc.documentElement).appendChild(style2);
    doc.documentElement.classList.add("sl-pic-fit");
  } catch {
    return;
  }
  var mean = function(px, width, x0, y0, x1, y1) {
    var rs = [];
    var gs = [];
    var bs = [];
    var a = 0;
    for (var y = y0; y < y1; y++)
      for (var x = x0; x < x1; x++) {
        var o = (y * width + x) * 4;
        rs.push(px[o]);
        gs.push(px[o + 1]);
        bs.push(px[o + 2]);
        a += px[o + 3];
      }
    var mid = function(v) {
      v.sort(function(p, q) {
        return p - q;
      });
      return v.length ? v[v.length >> 1] : 0;
    };
    return ["rgb(" + mid(rs) + "," + mid(gs) + "," + mid(bs) + ")", a / Math.max(1, rs.length)];
  };
  var edgesOf = function(px, width, height) {
    var out = { l: [], r: [], t: [], b: [], clear: false };
    var alpha = 0;
    var count = 0;
    var deep = Math.max(1, Math.min(2, Math.floor(Math.min(width, height) / 4)));
    for (var i = 0; i < STOPS; i++) {
      var y0 = Math.floor(i * height / STOPS);
      var y1 = Math.max(y0 + 1, Math.floor((i + 1) * height / STOPS));
      var x0 = Math.floor(i * width / STOPS);
      var x1 = Math.max(x0 + 1, Math.floor((i + 1) * width / STOPS));
      var l = mean(px, width, 0, y0, deep, y1);
      var r = mean(px, width, width - deep, y0, width, y1);
      var t = mean(px, width, x0, 0, x1, deep);
      var b = mean(px, width, x0, height - deep, x1, height);
      out.l.push(l[0]);
      out.r.push(r[0]);
      out.t.push(t[0]);
      out.b.push(b[0]);
      alpha += l[1] + r[1] + t[1] + b[1];
      count += 4;
    }
    out.clear = alpha / Math.max(1, count) < 245;
    return out;
  };
  var backdrop = function(e, axis) {
    var run = function(list, dir) {
      var stops = [];
      for (var i = 0; i < list.length; i++) stops.push(list[i] + " " + ((i + 0.5) * (100 / list.length)).toFixed(1) + "%");
      return "linear-gradient(" + dir + "," + stops.join(",") + ")";
    };
    return axis === "x" ? run(e.l, "to bottom") + " left top/50.5% 100% no-repeat," + run(e.r, "to bottom") + " right top/50.5% 100% no-repeat" : run(e.t, "to right") + " left top/100% 50.5% no-repeat," + run(e.b, "to right") + " left bottom/100% 50.5% no-repeat";
  };
  var axisOf = function(nr, br) {
    if (!(nr > 0) || !(br > 0)) return null;
    var k = nr / br;
    if (Math.abs(k - 1) < 5e-3) return null;
    return k < 1 ? "x" : "y";
  };
  w.__slPicFitParts = { edgesOf, backdrop, axisOf };
  var pixels = function(pic) {
    try {
      var nw = pic.naturalWidth;
      var nh = pic.naturalHeight;
      if (!(nw > 0 && nh > 0)) return null;
      var sw = Math.max(2, Math.min(48, nw));
      var sh = Math.max(2, Math.min(48, nh));
      var c = doc.createElement("canvas");
      c.width = sw;
      c.height = sh;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(pic, 0, 0, sw, sh);
      return edgesOf(ctx.getImageData(0, 0, sw, sh).data, sw, sh);
    } catch {
      return null;
    }
  };
  var apply = function(img) {
    var key = img.currentSrc || img.src || "";
    var e = edges[key];
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    var bw = img.clientWidth;
    var bh = img.clientHeight;
    if (!(bw > 4 && bh > 4 && nw > 0 && nh > 0)) return;
    var axis = axisOf(nw / nh, bw / bh);
    if (!axis) {
      img.setAttribute("data-pic-fit", "fill");
      return;
    }
    if (!e || e.clear) {
      img.setAttribute("data-pic-fit", e ? "clear" : "open");
      return;
    }
    img.style.setProperty("--pf-bg", backdrop(e, axis));
    img.setAttribute("data-pic-fit", "band");
  };
  var sizes = typeof ResizeObserver === "function" ? new ResizeObserver(function(list) {
    for (var i = 0; i < list.length; i++) {
      var t = list[i].target;
      if (t.getAttribute("data-pic-fit") !== "off") apply(t);
    }
  }) : null;
  var settle2 = function(key, found) {
    edges[key] = found;
    var list = reading[key] || [];
    delete reading[key];
    for (var i = 0; i < list.length; i++) if ((list[i].currentSrc || list[i].src) === key) apply(list[i]);
  };
  var viaOptimizer = function(key) {
    var at;
    try {
      at = new URL(key, doc.baseURI);
    } catch {
      return settle2(key, null);
    }
    var here = doc.location ? doc.location.origin : "";
    if (!here || here === "null" || !/^https?:$/.test(at.protocol) || at.origin === here) return settle2(key, null);
    var small = new Image();
    small.crossOrigin = "anonymous";
    small.decoding = "async";
    small.onload = function() {
      settle2(key, pixels(small));
    };
    small.onerror = function() {
      settle2(key, null);
    };
    small.src = here + "/_next/image?url=" + encodeURIComponent(at.href) + "&w=64&q=75";
  };
  var paint = function(img) {
    if (!img || !img.closest || img.getAttribute("data-pic-fit") === "off") return;
    if (!img.closest(FRAMES) || img.closest('[data-cover-padded="keep"]')) return;
    var key = img.currentSrc || img.src || "";
    if (!key) return;
    if (PADDED.test(key) && img.getAttribute("data-cover-trim") !== "none") return;
    if (sizes && !img.hasAttribute("data-pic-fit")) sizes.observe(img);
    if (key in edges) return apply(img);
    if (reading[key]) {
      reading[key].push(img);
      return;
    }
    var found = pixels(img);
    if (found) {
      edges[key] = found;
      return apply(img);
    }
    reading[key] = [img];
    viaOptimizer(key);
  };
  w.__slPicFitPaint = paint;
  doc.addEventListener(
    "load",
    function(e) {
      var t = e.target;
      if (t && t.tagName === "IMG") paint(t);
    },
    true
  );
  var early = function() {
    var imgs = doc.images;
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete && imgs[i].naturalWidth > 0) paint(imgs[i]);
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", early);
  else early();
})(document,window)}catch(e){}
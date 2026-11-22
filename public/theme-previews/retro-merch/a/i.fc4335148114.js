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
    var box = { x: across ? across[0] : 0, y: down ? down[0] : 0, w: across ? across[1] : 1, h: down ? down[1] : 1 };
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
    full.onload = function() {
      if (!fromImage(full) && !fromImage(fallback)) settle2(key, "");
    };
    full.onerror = function() {
      if (!fromImage(fallback)) settle2(key, "");
    };
    full.src = key;
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
})(document,window)}catch(e){}
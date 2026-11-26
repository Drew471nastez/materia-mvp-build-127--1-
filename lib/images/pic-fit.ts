/**
 * ===========================================================================
 *  A PRODUCT PICTURE IS NEVER CUT (round 65)
 * ===========================================================================
 * The owner: keep the picture's ratio, a square or 4:5 frame like Instagram,
 * and fit what the creator uploaded so it sits well in it: never cut, never
 * stretched, never shrunk to a sliver.
 *
 * Every theme draws a product card and a product gallery as a frame of a
 * fixed shape (Theme settings > Product cards > Image ratio: square, 4:5,
 * 4:3, a custom one). The picture filled it (object-fit: cover), so a poster
 * 0.7 wide in a square frame lost 30% of itself and a 16:9 photo lost 44%.
 *
 * Now the whole picture sits in the frame (object-fit: contain), and what is
 * left of the frame either side of it is painted from the picture's own
 * edge: each band is a gradient through the colours along the edge it
 * touches, so a poster on black sits on black and a photo's sky runs on
 * into the band. A picture the frame's shape fills it edge to edge, as
 * before. No grey bars, no blur, nothing to download: the colours are read
 * off the picture the page already has (a same origin /_next/image file;
 * another host's picture is read through this origin's optimizer at 64px).
 *
 * The frames (FRAMES): a Materia card (.product-item__media--ratio) and
 * gallery picture (.media-gallery__image), and anything marked
 * [data-pic-frame] (the native theme's grid and gallery, Storelib's own
 * product page). Explore's 16:9 cards ([data-cover-padded="keep"]) are left
 * as they are.
 *
 * A padded copy (`_processed.jpg`, lib/images/cover-trim.ts) is painted once
 * the trim has cut its padding off (its new picture loads again here), or
 * once the trim found none.
 *
 * Self contained on purpose, like cover-trim: written into pages as its own
 * source (installPicFit.toString()), so it may not reach anything outside.
 */

/** The frames a product picture is fitted into. */
export const PIC_FRAMES = ".product-item__media--ratio,.media-gallery__image,[data-pic-frame]"

/** How many colours each band's gradient runs through. */
export const PIC_FIT_STOPS = 6

/** Installs the fit on a document. Safe to run twice (the second does nothing). */
export function installPicFit(doc: Document, win: Window): void {
  var w = win as Window & { __slPicFit?: unknown; __slPicFitPaint?: unknown; __slPicFitParts?: unknown }
  if (w.__slPicFit) return
  w.__slPicFit = true
  var FRAMES = ".product-item__media--ratio,.media-gallery__image,[data-pic-frame]"
  var PADDED = /_processed\.jpe?g/i
  var STOPS = 6
  type Edges = { l: string[]; r: string[]; t: string[]; b: string[]; clear: boolean }
  var edges: Record<string, Edges | null> = {}
  var reading: Record<string, HTMLImageElement[]> = {}

  try {
    var style = doc.createElement("style")
    style.setAttribute("data-sl-pic-fit", "")
    /* The whole picture in its frame, centred (a focal point means nothing when nothing is cut), on its own edge's colours. */
    style.textContent =
      "html.sl-pic-fit :is(" + FRAMES + ') img:not([data-pic-fit="off"]){object-fit:contain!important;object-position:50% 50%!important}' +
      'html.sl-pic-fit img[data-pic-fit="band"]{background:var(--pf-bg)!important}'
    ;(doc.head || doc.documentElement).appendChild(style)
    doc.documentElement.classList.add("sl-pic-fit")
  } catch {
    /* No style: the theme's own fit stays. */
    return
  }

  /*
   * The colour of a run of pixels, as CSS: each channel's median, so a small mark at the edge (a logo in a corner,
   * a price sticker) does not tint the whole band. Alpha is averaged, so a see-through edge can be told.
   */
  var mean = function (px: ArrayLike<number>, width: number, x0: number, y0: number, x1: number, y1: number): [string, number] {
    var rs: number[] = []
    var gs: number[] = []
    var bs: number[] = []
    var a = 0
    for (var y = y0; y < y1; y++)
      for (var x = x0; x < x1; x++) {
        var o = (y * width + x) * 4
        rs.push(px[o])
        gs.push(px[o + 1])
        bs.push(px[o + 2])
        a += px[o + 3]
      }
    var mid = function (v: number[]) {
      v.sort(function (p, q) {
        return p - q
      })
      return v.length ? v[v.length >> 1] : 0
    }
    return ["rgb(" + mid(rs) + "," + mid(gs) + "," + mid(bs) + ")", a / Math.max(1, rs.length)]
  }

  /* The colours along each edge (two pixels deep), STOPS of them per edge, from the picture's pixels at width x height. */
  var edgesOf = function (px: ArrayLike<number>, width: number, height: number): Edges {
    var out: Edges = { l: [], r: [], t: [], b: [], clear: false }
    var alpha = 0
    var count = 0
    var deep = Math.max(1, Math.min(2, Math.floor(Math.min(width, height) / 4)))
    for (var i = 0; i < STOPS; i++) {
      var y0 = Math.floor((i * height) / STOPS)
      var y1 = Math.max(y0 + 1, Math.floor(((i + 1) * height) / STOPS))
      var x0 = Math.floor((i * width) / STOPS)
      var x1 = Math.max(x0 + 1, Math.floor(((i + 1) * width) / STOPS))
      var l = mean(px, width, 0, y0, deep, y1)
      var r = mean(px, width, width - deep, y0, width, y1)
      var t = mean(px, width, x0, 0, x1, deep)
      var b = mean(px, width, x0, height - deep, x1, height)
      out.l.push(l[0])
      out.r.push(r[0])
      out.t.push(t[0])
      out.b.push(b[0])
      alpha += l[1] + r[1] + t[1] + b[1]
      count += 4
    }
    /* A cut out product on a see-through background: the frame's own colour shows through, as the theme drew it. */
    out.clear = alpha / Math.max(1, count) < 245
    return out
  }

  /* The two bands' gradients for a picture narrower than its box (axis x: left and right) or wider (y: top and bottom). */
  var backdrop = function (e: Edges, axis: "x" | "y"): string {
    var run = function (list: string[], dir: string) {
      var stops: string[] = []
      for (var i = 0; i < list.length; i++) stops.push(list[i] + " " + ((i + 0.5) * (100 / list.length)).toFixed(1) + "%")
      return "linear-gradient(" + dir + "," + stops.join(",") + ")"
    }
    return axis === "x"
      ? run(e.l, "to bottom") + " left top/50.5% 100% no-repeat," + run(e.r, "to bottom") + " right top/50.5% 100% no-repeat"
      : run(e.t, "to right") + " left top/100% 50.5% no-repeat," + run(e.b, "to right") + " left bottom/100% 50.5% no-repeat"
  }

  /* Which bands a picture of natural ratio nr leaves in a box of ratio br: none when it fills it (under half a percent off). */
  var axisOf = function (nr: number, br: number): "x" | "y" | null {
    if (!(nr > 0) || !(br > 0)) return null
    var k = nr / br
    if (Math.abs(k - 1) < 0.005) return null
    return k < 1 ? "x" : "y"
  }
  w.__slPicFitParts = { edgesOf: edgesOf, backdrop: backdrop, axisOf: axisOf }

  var pixels = function (pic: HTMLImageElement): Edges | null {
    try {
      var nw = pic.naturalWidth
      var nh = pic.naturalHeight
      if (!(nw > 0 && nh > 0)) return null
      var sw = Math.max(2, Math.min(48, nw))
      var sh = Math.max(2, Math.min(48, nh))
      var c = doc.createElement("canvas")
      c.width = sw
      c.height = sh
      var ctx = c.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings)
      if (!ctx) return null
      ctx.drawImage(pic, 0, 0, sw, sh)
      return edgesOf(ctx.getImageData(0, 0, sw, sh).data, sw, sh)
    } catch {
      /* Another host's picture: its pixels cannot be read here. */
      return null
    }
  }

  var apply = function (img: HTMLImageElement) {
    var key = img.currentSrc || img.src || ""
    var e = edges[key]
    var nw = img.naturalWidth
    var nh = img.naturalHeight
    var bw = img.clientWidth
    var bh = img.clientHeight
    if (!(bw > 4 && bh > 4 && nw > 0 && nh > 0)) return
    var axis = axisOf(nw / nh, bw / bh)
    if (!axis) {
      img.setAttribute("data-pic-fit", "fill")
      return
    }
    if (!e || e.clear) {
      img.setAttribute("data-pic-fit", e ? "clear" : "open")
      return
    }
    img.style.setProperty("--pf-bg", backdrop(e, axis))
    img.setAttribute("data-pic-fit", "band")
  }

  var sizes = typeof ResizeObserver === "function"
    ? new ResizeObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var t = list[i].target as HTMLImageElement
          if (t.getAttribute("data-pic-fit") !== "off") apply(t)
        }
      })
    : null

  var settle = function (key: string, found: Edges | null) {
    edges[key] = found
    var list = reading[key] || []
    delete reading[key]
    for (var i = 0; i < list.length; i++) if ((list[i].currentSrc || list[i].src) === key) apply(list[i])
  }

  /* Another host's picture: its colours from this origin's optimizer, 64px wide (same origin, so readable). */
  var viaOptimizer = function (key: string) {
    var at: URL
    try {
      at = new URL(key, doc.baseURI)
    } catch {
      return settle(key, null)
    }
    var here = doc.location ? doc.location.origin : ""
    if (!here || here === "null" || !/^https?:$/.test(at.protocol) || at.origin === here) return settle(key, null)
    var small = new Image()
    small.crossOrigin = "anonymous"
    small.decoding = "async"
    small.onload = function () {
      settle(key, pixels(small))
    }
    small.onerror = function () {
      settle(key, null)
    }
    small.src = here + "/_next/image?url=" + encodeURIComponent(at.href) + "&w=64&q=75"
  }

  var paint = function (img: HTMLImageElement) {
    if (!img || !img.closest || img.getAttribute("data-pic-fit") === "off") return
    if (!img.closest(FRAMES) || img.closest('[data-cover-padded="keep"]')) return
    var key = img.currentSrc || img.src || ""
    if (!key) return
    /* A padded copy is the trim's first: it loads its cut picture (painted then), or says there was nothing to cut. */
    if (PADDED.test(key) && img.getAttribute("data-cover-trim") !== "none") return
    if (sizes && !img.hasAttribute("data-pic-fit")) sizes.observe(img)
    if (key in edges) return apply(img)
    if (reading[key]) {
      reading[key].push(img)
      return
    }
    var found = pixels(img)
    if (found) {
      edges[key] = found
      return apply(img)
    }
    reading[key] = [img]
    viaOptimizer(key)
  }
  w.__slPicFitPaint = paint

  doc.addEventListener(
    "load",
    function (e) {
      var t = e.target as HTMLElement | null
      if (t && t.tagName === "IMG") paint(t as HTMLImageElement)
    },
    true,
  )
  var early = function () {
    var imgs = doc.images
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete && imgs[i].naturalWidth > 0) paint(imgs[i])
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", early)
  else early()
}

/** The script for a page's <head>, run after the trim (lib/images/cover-trim.ts COVER_TRIM_SCRIPT carries it). */
export const PIC_FIT_SCRIPT = `try{(${installPicFit.toString()})(document,window)}catch(e){}`

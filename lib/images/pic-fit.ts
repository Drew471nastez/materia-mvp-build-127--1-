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
      /* Round 67: a picture near its frame's shape fills it. */
      "html.sl-pic-fit :is(" + FRAMES + ') img[data-pic-fit="fill"]{object-fit:cover!important}' +
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

  /*
   * Which bands a picture of natural ratio nr leaves in a box of ratio br: none when it fills it. Round 67: a picture
   * within NEAR of its frame's shape fills it (object-fit: cover), losing at most 7.4% across one side (under 4% at each edge), the trim every
   * shop's grid makes; only a picture further off than that sits whole on its edge's colours. Before, anything over
   * half a percent off was contained, so a 4:5 photo in a 3:4 card sat inside thin bands.
   */
  var NEAR = 1.08
  var axisOf = function (nr: number, br: number): "x" | "y" | null {
    if (!(nr > 0) || !(br > 0)) return null
    var k = nr / br
    if (k <= NEAR && k >= 1 / NEAR) return null
    return k < 1 ? "x" : "y"
  }

  /*
   * THE FRAME TAKES THE PICTURES' SHAPE (round 67). The owner: a card's picture sat small in a grey box (a 16:9
   * banner in a 3:4 card covered 42% of it, a 4:3 photo 56%). A row of frames whose pictures are mostly another
   * shape than the theme's setting takes theirs: the middle shape of the pictures in that row (a grid, a
   * gallery), snapped to one of SHAPES, so a shop of banners gets banner cards, filled edge to edge. A row whose
   * pictures are near its frame keeps the theme's shape. A frame on its own takes its picture's. A theme that
   * already gives each frame its own picture's shape (frames of differing shapes) is left as it is.
   */
  var SHAPES = [16 / 9, 3 / 2, 4 / 3, 1, 4 / 5, 3 / 4, 2 / 3]
  var snap = function (r: number): number {
    var best = SHAPES[0]
    var d = Infinity
    for (var i = 0; i < SHAPES.length; i++) {
      var x = Math.abs(Math.log(r / SHAPES[i]))
      if (x < d) {
        d = x
        best = SHAPES[i]
      }
    }
    return best
  }
  /* The row's shape from its pictures' ratios and the frame's own: null to keep the frame's. */
  var shapeOf = function (ratios: number[], frame: number): number | null {
    var list = ratios.filter(function (r) {
      return r > 0
    })
    if (!list.length || !(frame > 0)) return null
    list.sort(function (a, b) {
      return a - b
    })
    var mid = list[list.length >> 1]
    var k = mid / frame
    if (k <= NEAR && k >= 1 / NEAR) return null
    return snap(mid)
  }
  w.__slPicFitParts = { edgesOf: edgesOf, backdrop: backdrop, axisOf: axisOf, shapeOf: shapeOf, snap: snap }

  /* A frame's declared shape: the theme's --aspect-ratio (3/4, 0.75) or its CSS aspect-ratio. */
  var declared = function (frame: HTMLElement): number {
    var v = (frame.style.getPropertyValue("--aspect-ratio") || "").trim()
    if (!v) {
      try {
        v = (win.getComputedStyle(frame).aspectRatio || "").replace("auto", "").trim()
      } catch {
        v = ""
      }
    }
    var m = v.match(/^([\d.]+)\s*(?:\/\s*([\d.]+))?$/)
    if (!m) return 0
    var r = Number(m[1]) / (m[2] ? Number(m[2]) : 1)
    return r > 0 && isFinite(r) ? r : 0
  }
  /* The frames that are one row with this one: the nearest container holding more than one frame. */
  var rowOf = function (frame: HTMLElement): HTMLElement[] {
    var at = frame.parentElement
    for (var i = 0; i < 8 && at && at !== doc.body; i++) {
      var list = at.querySelectorAll(FRAMES)
      if (list.length > 1) {
        var out: HTMLElement[] = []
        for (var j = 0; j < list.length; j++) if (!list[j].closest('[data-cover-padded="keep"]')) out.push(list[j] as HTMLElement)
        return out
      }
      at = at.parentElement
    }
    return [frame]
  }
  var setShape = function (frame: HTMLElement, r: number) {
    var v = String(Math.round(r * 10000) / 10000)
    if (frame.getAttribute("data-pic-shape") === v) return
    if (!frame.hasAttribute("data-pic-was")) frame.setAttribute("data-pic-was", String(declared(frame)))
    frame.setAttribute("data-pic-shape", v)
    if (frame.style.getPropertyValue("--aspect-ratio")) {
      frame.style.setProperty("--aspect-ratio", v)
      if (frame.style.getPropertyValue("--aspect-ratio-mb")) frame.style.setProperty("--aspect-ratio-mb", v)
    } else frame.style.aspectRatio = v
  }
  /* Each frame in this picture's row given the row's shape, once its pictures' shapes are known. */
  /*
   * THE SHAPES SEEN BEFORE, KEPT IN THIS BROWSER (round 67), so a row is given its shape before its pictures load
   * and nothing below it moves: a picture's ratio by its address (the file behind the optimizer, without the size
   * asked for). The first visit's row takes its shape as soon as each picture's size is known, which the browser
   * reads from the file's first bytes, before it is drawn (watchSizes).
   */
  var SEEN = "sl:pic-r"
  var seen: Record<string, number> = {}
  try {
    seen = JSON.parse(win.localStorage.getItem(SEEN) || "{}") || {}
  } catch {
    seen = {}
  }
  var addressOf = function (src: string): string {
    try {
      var u = new URL(src, doc.baseURI)
      var raw = u.pathname === "/_next/image" ? u.searchParams.get("url") : null
      var at = raw ? new URL(raw, doc.baseURI) : u
      return at.host + at.pathname
    } catch {
      return ""
    }
  }
  var remember = function (src: string, r: number) {
    var k = addressOf(src)
    if (!k || !(r > 0)) return
    var v = Math.round(r * 1000) / 1000
    if (seen[k] === v) return
    seen[k] = v
    try {
      var keys = Object.keys(seen)
      if (keys.length > 400) delete seen[keys[0]]
      win.localStorage.setItem(SEEN, JSON.stringify(seen))
    } catch {
      /* Kept for this page only. */
    }
  }
  /* A picture's ratio: its own once its size is known, else the one this browser saw before. 0 when neither. */
  var ratioOf = function (pic: HTMLImageElement): number {
    var src = pic.currentSrc || pic.src || ""
    if (PADDED.test(src) && pic.getAttribute("data-cover-trim") !== "none") return 0
    if (pic.naturalWidth > 0 && pic.naturalHeight > 0) {
      var r = pic.naturalWidth / pic.naturalHeight
      remember(src, r)
      return r
    }
    return seen[addressOf(src)] || 0
  }
  var reshape = function (img: HTMLImageElement) {
    var frame = img.closest(FRAMES) as HTMLElement | null
    if (!frame || frame.closest('[data-cover-padded="keep"]')) return
    var row = rowOf(frame)
    var own: number[] = []
    var ratios: number[] = []
    for (var i = 0; i < row.length; i++) {
      var was = Number(row[i].getAttribute("data-pic-was")) || declared(row[i])
      if (was > 0 && own.indexOf(Math.round(was * 100)) < 0) own.push(Math.round(was * 100))
      var pics = row[i].getElementsByTagName("img")
      var pic: HTMLImageElement | null = null
      for (var q = 0; q < pics.length && !pic; q++) if (!pics[q].closest(".secondary-image,.hover-effect__alt") && !pics[q].classList.contains("secondary-image") && pics[q].getAttribute("data-pic-fit") !== "off") pic = pics[q]
      var r = pic ? ratioOf(pic) : 0
      if (r > 0) ratios.push(r)
    }
    /* Frames of differing shapes: the theme gives each its picture's own (Adapt). */
    if (own.length !== 1) return
    var shape = shapeOf(ratios, own[0] / 100)
    for (var j = 0; j < row.length; j++) {
      if (shape) setShape(row[j], shape)
      else if (row[j].hasAttribute("data-pic-shape")) setShape(row[j], Number(row[j].getAttribute("data-pic-was")) || own[0] / 100)
    }
  }

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
    try {
      reshape(img)
    } catch {
      /* The frame keeps the theme's shape. */
    }
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
  /* Every frame's row shaped from what is known now, then each frame by frame as its picture's size arrives (until the page has loaded, at most 4s). */
  var shaped: HTMLImageElement[] = []
  var watchSizes = function () {
    var started = Date.now()
    var tick = function () {
      var imgs = doc.images
      for (var i = 0; i < imgs.length; i++) {
        var im = imgs[i]
        if (shaped.indexOf(im) >= 0 || !im.closest || !im.closest(FRAMES)) continue
        if (im.naturalWidth > 0 || seen[addressOf(im.currentSrc || im.src || "")]) {
          shaped.push(im)
          try {
            reshape(im)
          } catch {
            /* The theme's shape. */
          }
        }
      }
      if (doc.readyState !== "complete" && Date.now() - started < 4000) (win.requestAnimationFrame || win.setTimeout)(tick)
    }
    tick()
  }
  /* While the page is still being read: a frame's row given the shape this browser saw before as soon as the frame is in the page, before it is drawn. */
  if (doc.readyState === "loading" && typeof MutationObserver === "function") {
    var parsing = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes
        for (var j = 0; j < added.length; j++) {
          var n = added[j] as Element
          if (n.nodeType !== 1) continue
          var imgs = n.tagName === "IMG" ? [n as HTMLImageElement] : Array.prototype.slice.call(n.getElementsByTagName("img"))
          for (var q = 0; q < imgs.length; q++) {
            var im = imgs[q] as HTMLImageElement
            if (!seen[addressOf(im.currentSrc || im.src || "")]) continue
            try {
              reshape(im)
            } catch {
              /* The theme's shape. */
            }
          }
        }
      }
    })
    parsing.observe(doc.documentElement, { childList: true, subtree: true })
    doc.addEventListener("DOMContentLoaded", function () {
      parsing.disconnect()
    })
  }
  var early = function () {
    watchSizes()
    var imgs = doc.images
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete && imgs[i].naturalWidth > 0) paint(imgs[i])
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", early)
  else early()
}

/** The script for a page's <head>, run after the trim (lib/images/cover-trim.ts COVER_TRIM_SCRIPT carries it). */
export const PIC_FIT_SCRIPT = `try{(${installPicFit.toString()})(document,window)}catch(e){}`

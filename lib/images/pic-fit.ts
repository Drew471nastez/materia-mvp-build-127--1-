/**
 * ===========================================================================
 *  A PRODUCT PICTURE FILLS ITS FRAME (round 68)
 * ===========================================================================
 * The owner, on a Notion template's cards and its product page: "the images
 * should be displaying in the whole product card image, cover fit." Rounds
 * 65 to 67 drew every product picture whole (object-fit: contain) in a frame
 * of the theme's shape and painted the rest of the frame from the picture's
 * edge, then learned a row's shape in localStorage to put on the next page.
 * On screen that was a small picture inside a tinted box, a card whose
 * picture was narrower than its column, a product photo floating in a grey
 * box, and frames whose shape changed between a first visit and the next.
 *
 * Now every frame keeps the theme's shape (Theme settings > Product cards >
 * Image ratio, the gallery's own setting) and its picture covers it, centred
 * or on the picture's focal point (Materia's --point): what Materia's and
 * the native theme's own stylesheets draw. A template that contained its
 * product pictures on its own (Octavo's product page, Space's cards) is
 * covered too, here, so stores installed with those files change without a
 * reinstall. Nothing is measured to place a frame, so nothing moves after
 * the first paint.
 *
 * ONE EXCEPTION, A CUT OUT PRODUCT. A picture whose edges are see-through (a
 * product photographed on nothing, saved as a PNG or WebP) has no background
 * to lose, only the product: covered, a wide sneaker in a 3:4 card loses its
 * toe and heel. Such a picture of another shape than its frame is drawn whole
 * (contain), on the frame's own background, which is how a shop's cut out
 * products read anyway. Its pixels are read once it has loaded: a same origin
 * file (every website picture goes through /_next/image), or another host's
 * through this origin's optimizer at 64px.
 *
 * The frames (FRAMES): a Materia card (.product-item__media--ratio) and
 * gallery picture (.media-gallery__image), and anything marked
 * [data-pic-frame] (the native theme's grid and gallery, Storelib's own
 * product page). Explore's 16:9 cards ([data-cover-padded="keep"]) are left
 * as they are. A picture marked data-pic-fit="off" is never touched.
 *
 * Self contained on purpose, like cover-trim: written into pages as its own
 * source (installPicFit.toString()), so it may not reach anything outside.
 */

/** The frames a product picture is fitted into. */
export const PIC_FRAMES = ".product-item__media--ratio,.media-gallery__image,[data-pic-frame]"

/** The localStorage key round 67 kept row shapes under; cleared once, never read. */
export const PIC_ROW_KEY = "sl:pic-row"

/** Installs the fit on a document. Safe to run twice (the second does nothing). */
export function installPicFit(doc: Document, win: Window): void {
  var w = win as Window & { __slPicFit?: unknown; __slPicFitPaint?: unknown; __slPicFitParts?: unknown }
  if (w.__slPicFit) return
  w.__slPicFit = true
  var FRAMES = ".product-item__media--ratio,.media-gallery__image,[data-pic-frame]"
  var PADDED = /_processed\.jpe?g/i
  /* Within 8% of its frame's shape a cut out product covers it like any picture: under 4% lost at each edge. */
  var NEAR = 1.08
  var clear: Record<string, boolean | null> = {}
  var reading: Record<string, HTMLImageElement[]> = {}

  try {
    var style = doc.createElement("style")
    style.setAttribute("data-sl-pic-fit", "")
    style.textContent =
      /* Materia's frames cover, over a template's own contain (Octavo's product page, Space's cards) and on stores installed with it. */
      'html.sl-pic-fit :is(.product-item__media--ratio,.media-gallery__image) img:not([data-pic-fit]):not([data-cover-padded="keep"] *){object-fit:cover!important}' +
      "html.sl-pic-fit :is(" + FRAMES + ') img[data-pic-fit="cutout"]{object-fit:contain!important}'
    ;(doc.head || doc.documentElement).appendChild(style)
    doc.documentElement.classList.add("sl-pic-fit")
  } catch {
    return
  }
  /* Round 67's learned row shapes: no longer read, so no longer kept. */
  try {
    win.localStorage.removeItem("sl:pic-row")
  } catch {
    /* No storage. */
  }

  /* See-through along its edges: the mean alpha of the outermost pixels of an RGBA buffer under 245 of 255. */
  var seeThrough = function (px: ArrayLike<number>, width: number, height: number): boolean {
    var a = 0
    var n = 0
    for (var x = 0; x < width; x++) {
      a += px[x * 4 + 3] + px[((height - 1) * width + x) * 4 + 3]
      n += 2
    }
    for (var y = 0; y < height; y++) {
      a += px[y * width * 4 + 3] + px[(y * width + width - 1) * 4 + 3]
      n += 2
    }
    return a / Math.max(1, n) < 245
  }
  /* A picture of natural ratio nr in a frame of ratio br is far enough off for a cut out product to sit whole. */
  var offShape = function (nr: number, br: number): boolean {
    if (!(nr > 0) || !(br > 0)) return false
    var k = nr / br
    return k > NEAR || k < 1 / NEAR
  }
  w.__slPicFitParts = { seeThrough: seeThrough, offShape: offShape }

  var pixels = function (pic: HTMLImageElement): boolean | null {
    try {
      var nw = pic.naturalWidth
      var nh = pic.naturalHeight
      if (!(nw > 0 && nh > 0)) return null
      var sw = Math.max(2, Math.min(32, nw))
      var sh = Math.max(2, Math.min(32, nh))
      var c = doc.createElement("canvas")
      c.width = sw
      c.height = sh
      var ctx = c.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings)
      if (!ctx) return null
      ctx.drawImage(pic, 0, 0, sw, sh)
      return seeThrough(ctx.getImageData(0, 0, sw, sh).data, sw, sh)
    } catch {
      /* Another host's picture: its pixels cannot be read here. */
      return null
    }
  }

  var apply = function (img: HTMLImageElement) {
    var key = img.currentSrc || img.src || ""
    var nw = img.naturalWidth
    var nh = img.naturalHeight
    var bw = img.clientWidth
    var bh = img.clientHeight
    if (!(nw > 0 && nh > 0)) return
    if (clear[key] && (!(bw > 4 && bh > 4) || offShape(nw / nh, bw / bh))) img.setAttribute("data-pic-fit", "cutout")
    else if (img.getAttribute("data-pic-fit") === "cutout") img.removeAttribute("data-pic-fit")
  }

  var settle = function (key: string, found: boolean | null) {
    clear[key] = found
    var list = reading[key] || []
    delete reading[key]
    for (var i = 0; i < list.length; i++) if ((list[i].currentSrc || list[i].src) === key) apply(list[i])
  }

  /* Another host's picture: its alpha from this origin's optimizer, 64px wide (same origin, so readable). */
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
    /* A padded copy is the trim's first: it loads its cut picture (looked at then), or says there was nothing to cut. */
    if (PADDED.test(key) && img.getAttribute("data-cover-trim") !== "none") return
    /* A JPEG has no see-through pixels: nothing to read. */
    if (/\.jpe?g(?:[?#&]|%3F|%26|$)/i.test(key)) return
    if (key in clear) return apply(img)
    if (reading[key]) {
      reading[key].push(img)
      return
    }
    var found = pixels(img)
    if (found !== null) {
      clear[key] = found
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

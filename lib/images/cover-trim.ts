/**
 * ===========================================================================
 *  NO GREY BARS OUTSIDE EXPLORE (round AL)
 * ===========================================================================
 * The owner: a creator adds a download and uploads a portrait cover (4:5,
 * 3:4). The editor stores a 1280x720 copy of it with light grey padding
 * either side (processImageToWidescreen in
 * app/(storelib)/app/products/new/product-editor.tsx, named `…_processed.jpg`)
 * so every card on Explore is the same 16:9 shape. Only Explore and the
 * marketplace's cards should show that copy. Everywhere else (the editor's
 * tiles, a website's product sections, the store's grid, the OnePage, the
 * product page, checkout, the library) the picture is shown in its own shape,
 * or fills its card (object-fit: cover).
 *
 * The picture as uploaded is stored beside the copy (products.cover_original_url,
 * SQL part 377, lib/products/cover.ts) and the main data paths draw that. This
 * is the net under all of them, for what is left:
 *
 *   - a product saved before part 377, or on a database without it;
 *   - the gallery's second and later photos, which were only ever stored padded;
 *   - any of the many places that still read `thumbnail_url` as it is
 *     (an imported theme's `product.featured_image`, a cart row, an email
 *     preview, the dashboard's lists).
 *
 * It runs in <head>, before the body is read, and listens for every <img>
 * that loads (capture phase, so a theme's or a script's own pictures too).
 * A picture whose address is a padded copy (`_processed.jp(e)g`, through
 * Next's optimizer or not) is read once at its full 1280x720, the padding is
 * found in its pixels (the same rules as lib/images/letterbox findLetterbox),
 * and the element is pointed at the picture inside it. The element keeps its
 * box and its own CSS, so a card whose image is `object-fit: cover` fills
 * with the picture, and one that shows a picture in its own shape gets the
 * picture's shape. Until then a padded picture is held unseen (opacity, so
 * its box stays), so the bars never flash.
 *
 * WHAT IT LEAVES ALONE:
 *   - Explore: an <img data-cover-trim="keep">, or any inside
 *     [data-cover-padded="keep"] (components/explore/product-card.tsx with
 *     discoverLayout, the featured banner);
 *   - a picture components/ui/framed-picture.tsx places itself
 *     (data-cover-trim="framed"): it already frames the picture inside;
 *   - a copy whose pixels cannot be read (another host without CORS), or
 *     with no bars after all (data-cover-trim="none"): shown as it is.
 *
 * Self contained on purpose: it is written into pages as its own source
 * (`installCoverTrim.toString()`), like lib/media/missing-image.ts's guard,
 * so it may not reach anything outside itself.
 */

/** The address of a padded copy, as the product editor names it. */
export const PADDED_COPY = /_processed\.jpe?g/i

/** Installs the trim on a document. Returns nothing; safe to run twice (the second does nothing). */
export function installCoverTrim(doc: Document, win: Window): void {
  var w = win as Window & { __slCoverTrim?: unknown; __slCoverBox?: unknown }
  if (w.__slCoverTrim) return
  var PADDED = /_processed\.jpe?g/i
  var shown: Record<string, string> = {}
  var waiting: Record<string, HTMLImageElement[]> = {}

  /* ---- findLetterbox (lib/images/letterbox.ts), line for line. ---- */
  var flat = function (px: ArrayLike<number>, width: number, at: number, column: boolean, length: number): [boolean, number] {
    var min = 255
    var max = 0
    var chroma = 0
    var sum = 0
    for (var i = 0; i < length; i++) {
      var x = column ? at : i
      var y = column ? i : at
      var o = (y * width + x) * 4
      var r = px[o]
      var g = px[o + 1]
      var b = px[o + 2]
      var lum = 0.299 * r + 0.587 * g + 0.114 * b
      if (lum < min) min = lum
      if (lum > max) max = lum
      var c = Math.max(r, g, b) - Math.min(r, g, b)
      if (c > chroma) chroma = c
      sum += lum
    }
    var light = sum / Math.max(1, length)
    return [max - min <= 18 && chroma <= 14 && (light >= 196 || light <= 34), light]
  }
  var edge = function (px: ArrayLike<number>, width: number, height: number, column: boolean, fromEnd: boolean): [number, number] {
    var count = column ? width : height
    var length = column ? height : width
    var run = 0
    var light = 0
    for (var k = 0; k < count; k++) {
      var line = flat(px, width, fromEnd ? count - 1 - k : k, column, length)
      if (!line[0]) break
      light = line[1]
      run++
    }
    return [run, light]
  }
  var sides = function (px: ArrayLike<number>, width: number, height: number, column: boolean): [number, number] | null {
    var size = column ? width : height
    var a = edge(px, width, height, column, false)
    var b = edge(px, width, height, column, true)
    if (!a[0] || !b[0]) return null
    if (a[0] + b[0] >= size * 0.9) return null
    if (Math.abs(a[0] - b[0]) > Math.max(2, size * 0.04)) return null
    if (a[0] + b[0] < size * 0.06) return null
    if (Math.abs(a[1] - b[1]) > 40) return null
    var start = Math.min(size, a[0] + 1)
    var end = Math.max(start, size - b[0] - 1)
    return [start / size, (end - start) / size]
  }
  var find = function (px: ArrayLike<number>, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
    if (!(width >= 8) || !(height >= 8) || px.length < width * height * 4) return null
    var across = sides(px, width, height, true)
    var down = sides(px, width, height, false)
    if (!across && !down) return null
    var box = { x: across ? across[0] : 0, y: down ? down[0] : 0, w: across ? across[1] : 1, h: down ? down[1] : 1 }
    if (box.w < 0.2 || box.h < 0.2) return null
    return box
  }
  w.__slCoverBox = find
  w.__slCoverTrim = true

  try {
    var style = doc.createElement("style")
    style.setAttribute("data-sl-cover-trim", "")
    /* Held unseen while it is read, never in Explore, never one already framed or left as it is. */
    style.textContent =
      'html.sl-cover-trim img[src*="_processed."]:not([data-cover-trim]):not([data-cover-padded="keep"] img),' +
      'html.sl-cover-trim img[data-cover-trim="busy"],html.sl-cover-trim img[data-cover-trim="done"][src*="_processed."]{opacity:0}'
    ;(doc.head || doc.documentElement).appendChild(style)
    doc.documentElement.classList.add("sl-cover-trim")
  } catch {
    /* No style: the bars may show for a moment before the picture is trimmed. */
  }

  /* The full copy behind an optimizer address, so the picture is cut from 1280x720 and not from a small size. */
  var fullOf = function (src: string): string {
    try {
      var u = new URL(src, doc.baseURI)
      if (u.pathname === "/_next/image") {
        var raw = u.searchParams.get("url")
        if (raw) return new URL(raw, doc.baseURI).href
      }
      return u.href
    } catch {
      return src
    }
  }

  var settle = function (key: string, url: string) {
    shown[key] = url
    var list = waiting[key] || []
    delete waiting[key]
    for (var i = 0; i < list.length; i++) {
      var img = list[i]
      /* Its address changed while this was read (a variant picked): it is looked at again for the new one. */
      if (fullOf(img.currentSrc || img.src || "") === key) put(img, key, url)
      else {
        img.removeAttribute("data-cover-trim")
        look(img)
      }
    }
  }

  var put = function (img: HTMLImageElement, key: string, url: string) {
    if (!url) {
      img.setAttribute("data-cover-trim", "none")
      img.setAttribute("data-cover-from", key)
      return
    }
    var parent = img.parentNode as Element | null
    if (parent && parent.tagName === "PICTURE") {
      var sources = parent.getElementsByTagName("source")
      for (var i = 0; i < sources.length; i++) sources[i].removeAttribute("srcset")
    }
    img.removeAttribute("srcset")
    img.removeAttribute("sizes")
    img.setAttribute("data-cover-trim", "done")
    img.setAttribute("data-cover-from", key)
    img.src = url
  }

  /* Reads the copy's pixels, finds its bars, and makes the picture inside it. "" when there is nothing to cut or it cannot be read. */
  var cut = function (key: string, fallback: HTMLImageElement) {
    var fromImage = function (pic: HTMLImageElement): boolean {
      try {
        var nw = pic.naturalWidth
        var nh = pic.naturalHeight
        if (!(nw > 0 && nh > 0)) return false
        var sw = Math.min(128, nw)
        var sh = Math.max(1, Math.round((sw * nh) / nw))
        var small = doc.createElement("canvas")
        small.width = sw
        small.height = sh
        var sctx = small.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings)
        if (!sctx) return false
        sctx.drawImage(pic, 0, 0, sw, sh)
        var box = find(sctx.getImageData(0, 0, sw, sh).data, sw, sh)
        if (!box) {
          settle(key, "")
          return true
        }
        var cx = Math.round(box.x * nw)
        var cy = Math.round(box.y * nh)
        var cw = Math.max(1, Math.round(box.w * nw))
        var ch = Math.max(1, Math.round(box.h * nh))
        var big = doc.createElement("canvas")
        big.width = cw
        big.height = ch
        var bctx = big.getContext("2d")
        if (!bctx) return false
        bctx.drawImage(pic, cx, cy, cw, ch, 0, 0, cw, ch)
        if (big.toBlob) {
          big.toBlob(
            function (blob) {
              if (!blob) return settle(key, "")
              settle(key, URL.createObjectURL(blob))
            },
            "image/jpeg",
            0.92,
          )
        } else {
          settle(key, big.toDataURL("image/jpeg", 0.92))
        }
        return true
      } catch {
        /* Another host's picture without CORS: its pixels cannot be read. */
        return false
      }
    }
    /* A read that never ends (a stalled connection) never keeps a picture unseen: after 4s it is shown as it is. */
    setTimeout(function () {
      if (waiting[key]) settle(key, "")
    }, 4000)
    var full = new Image()
    full.crossOrigin = "anonymous"
    full.decoding = "async"
    full.onload = function () {
      if (!fromImage(full) && !fromImage(fallback)) settle(key, "")
    }
    full.onerror = function () {
      if (!fromImage(fallback)) settle(key, "")
    }
    full.src = key
  }

  var look = function (img: HTMLImageElement) {
    var src = img.currentSrc || img.src || ""
    if (!src || !PADDED.test(src)) return
    var state = img.getAttribute("data-cover-trim")
    if (state === "keep" || state === "framed" || state === "busy") return
    if (img.closest && img.closest('[data-cover-padded="keep"]')) {
      img.setAttribute("data-cover-trim", "keep")
      return
    }
    var key = fullOf(src)
    if (state === "none" && img.getAttribute("data-cover-from") === key) return
    if (shown[key] !== undefined) return put(img, key, shown[key])
    img.setAttribute("data-cover-trim", "busy")
    if (waiting[key]) {
      waiting[key].push(img)
      return
    }
    waiting[key] = [img]
    cut(key, img)
  }

  doc.addEventListener(
    "load",
    function (e) {
      var t = e.target as HTMLElement | null
      if (t && t.tagName === "IMG") look(t as HTMLImageElement)
    },
    true,
  )
  doc.addEventListener(
    "error",
    function (e) {
      var t = e.target as HTMLElement | null
      if (t && t.tagName === "IMG" && t.getAttribute("data-cover-trim") !== "keep") t.setAttribute("data-cover-trim", "none")
    },
    true,
  )
  /* Pictures already loaded before this ran (a cached page shown again). */
  var early = function () {
    var imgs = doc.images
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete && imgs[i].naturalWidth > 0) look(imgs[i])
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", early)
  else early()
}

/** The script for a page's <head>: Storelib's own pages and its themes' websites (app/(storelib)/layout.tsx, app/(site)/layout.tsx). */
export const COVER_TRIM_SCRIPT = `try{(${installCoverTrim.toString()})(document,window)}catch(e){}`

/** The same, for a page that is a document of its own (an imported theme's, live and on the canvas; lib/storelib-theme/compat/theme.ts). */
export const COVER_TRIM_HEAD = `<script data-sl-cover-trim>${COVER_TRIM_SCRIPT}</script>`

/**
 * ===========================================================================
 *  A PICTURE OR A POST GOING BACK TO WHERE IT CAME FROM, ON A PHONE
 * ===========================================================================
 * Two pieces the opened post (post-fullscreen.tsx) and the picture viewer
 * (lightbox.tsx) share. The owner, round 24: "the image post goes back more
 * smooth, its proportion and size computed with the tab bar, safe, clean, no
 * glitch".
 *
 * REVEAL BEFORE THE WAY BACK. A card or a thumbnail half under the tab bar,
 * or under the community's header, was still a place to go back to: the
 * picture flew over the bar, landed half on it, and the bar popped back over
 * it as the layer went. The Photos app never does that: the grid behind has
 * already moved so the thumbnail is in full view. Here, while the layer
 * still covers the whole screen (nothing behind it can be seen move), the
 * page under it is scrolled by the least that brings the card clear of the
 * bars. Never while a finger has pulled the layer and the page shows.
 *
 * A COVER MORPH WITHOUT A CLIP. The viewer grew a picture out of its
 * thumbnail by animating `clip-path`, which WebKit repaints on the main
 * thread every frame (the opened post stopped doing it in round 22 for the
 * same stutter). Now a copy of the picture flies in a box that clips it:
 * the box moves and scales (translate and scale, on the compositor), and the
 * picture inside is scaled back by the box's stretch so it is never
 * squashed, only cropped, exactly as the thumbnail crops it. Sampled into
 * keyframes on iOS's curve and played linear, as the post's morph is.
 *
 * ONE PICTURE ON SCREEN, START TO END (round 32). The owner's recording of a
 * picture closing: a wide crop at the large size, then for a few frames that
 * crop and the whole picture on top of each other, then a snap into the
 * post's narrow picture. Three causes, all fixed here and in lightbox.tsx:
 *
 *   THE WRONG END   the morph landed on the thumbnail's BOX. A picture alone
 *                   in an opened post is drawn whole (object-contain) in a
 *                   box as wide as the post, so a portrait photo is a narrow
 *                   picture with room either side, and the copy flew into the
 *                   wide box, cropped wide. It now lands on the picture as
 *                   it is seen there (pictureRect): the box for a cropped
 *                   tile, the picture's own rectangle for a whole one, with
 *                   the corners the tile rounds it with.
 *   TWO COPIES      the copy faded out over the last fifth onto a thumbnail
 *                   that had been under the 94% black the whole time. The
 *                   thumbnail is now hidden while the viewer is open
 *                   (hideOrigin) and comes back in the frame the copy goes,
 *                   with nothing faded: the copy lands exactly on it.
 *   A BLANK END     a way in that ended before the large file was decoded
 *                   showed an empty slide. The copy now stays on the slide
 *                   until the large picture can be drawn, then goes in the
 *                   same frame it comes.
 */

/** cubic-bezier(x1, y1, x2, y2) as a function of time, solved for x by Newton then bisection. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1
  const x = (u: number) => ((ax * u + bx) * u + cx) * u
  const y = (u: number) => ((ay * u + by) * u + cy) * u
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx
  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let u = t
    for (let i = 0; i < 6; i++) {
      const d = dx(u)
      if (Math.abs(d) < 1e-6) break
      const next = u - (x(u) - t) / d
      if (next < 0 || next > 1) break
      u = next
    }
    if (Math.abs(x(u) - t) > 1e-4) {
      let lo = 0, hi = 1
      u = t
      for (let i = 0; i < 24; i++) {
        if (x(u) < t) lo = u
        else hi = u
        u = (lo + hi) / 2
      }
    }
    return y(u)
  }
}

/** "cubic-bezier(0.32, 0.72, 0, 1)" as a function; anything else is iOS's sheet curve. */
export function easeOf(css: string): (t: number) => number {
  const m = css.match(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/)
  return m ? bezier(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])) : bezier(0.32, 0.72, 0, 1)
}

/* ── REVEAL BEFORE THE WAY BACK ───────────────────────────────────────── */

/** What covers the top and the foot of the page a card sits in: the community's header and the phone's tab bar. */
const PAGE_TOP = "[data-community-top]"
const PAGE_FOOT = '[data-buyer-tab-bar="shown"]'
/** And inside an opened post: its own top strip and the floating comment box. */
const LAYER_TOP = "[data-post-fullscreen-top]"
const LAYER_FOOT = '[data-comments-composer="float"]'
/** Room left between the card and a bar, so it lands clear of the bar's shadow. */
const GAP = 8

function visible(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  const s = getComputedStyle(el)
  if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return null
  return r
}

/** The band of the screen a card in `el`'s place can be seen in: below every bar over its top, above every bar over its foot. */
export function clearBand(el: Element): { top: number; bottom: number } {
  const layer = el.closest("[data-post-fullscreen]")
  const scope: ParentNode = layer ?? document
  const H = window.visualViewport?.height ?? window.innerHeight
  let top = 0
  let bottom = H
  const inLayer = (n: Element) => !!n.closest("[data-post-fullscreen], [data-lightbox]")
  for (const n of Array.from(scope.querySelectorAll(layer ? LAYER_TOP : PAGE_TOP))) {
    if (!layer && inLayer(n)) continue
    const r = visible(n)
    if (r && r.top <= 1) top = Math.max(top, r.bottom)
  }
  for (const n of Array.from(scope.querySelectorAll(layer ? LAYER_FOOT : PAGE_FOOT))) {
    if (!layer && inLayer(n)) continue
    const r = visible(n)
    if (r && r.bottom >= H - 1) bottom = Math.min(bottom, r.top)
  }
  return { top, bottom }
}

function scrollerOf(el: Element): HTMLElement | null {
  let n = el.parentElement
  while (n && n !== document.body && n !== document.documentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n
    n = n.parentElement
  }
  return null
}

/**
 * Scroll whatever `el` scrolls in, at once, by the least that puts it clear
 * of the bars, and say by how much (0 when it already was, or cannot be).
 * A card taller than the band is put with its top under the top bar. Call
 * it only while a layer covers the screen whole.
 */
export function revealForReturn(el: Element | null | undefined): number {
  if (!el || !el.isConnected || typeof window === "undefined") return 0
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return 0
  const band = clearBand(el)
  const room = band.bottom - band.top - 2 * GAP
  let dy = 0
  if (r.top < band.top + GAP || r.height > room) dy = r.top - (band.top + GAP)
  else if (r.bottom > band.bottom - GAP) dy = r.bottom - (band.bottom - GAP)
  if (Math.abs(dy) < 1) return 0
  const scroller = scrollerOf(el)
  if (scroller) {
    const before = scroller.scrollTop
    scroller.scrollTo({ top: before + dy, behavior: "instant" as ScrollBehavior })
    return scroller.scrollTop - before
  }
  const before = window.scrollY
  window.scrollTo({ top: before + dy, behavior: "instant" as ScrollBehavior })
  return window.scrollY - before
}

/* ── A COVER MORPH WITHOUT A CLIP ─────────────────────────────────────── */

const STEPS = 24

/** Four corner radii in screen pixels: top left, top right, bottom right, bottom left. */
export type Corners = [number, number, number, number]
const SQUARE: Corners = [0, 0, 0, 0]

/** The picture a thumbnail shows now: of its pictures that are loaded and not faded out, the sharpest. */
export function shownPicture(tile: Element | null | undefined): HTMLImageElement | null {
  if (!tile) return null
  let best: HTMLImageElement | null = null
  for (const img of Array.from(tile.querySelectorAll("img"))) {
    if (!img.complete || img.naturalWidth < 2) continue
    const cs = getComputedStyle(img)
    /* Visibility is not read: hideOrigin hides them with it while the viewer is open, and they are still the picture. */
    if (cs.display === "none" || Number(cs.opacity) < 0.5) continue
    if (!best || img.naturalWidth > best.naturalWidth) best = img
  }
  return best
}

/** A radius as written ("12px", "50%", "12px 8px"), in pixels for a box this size. */
function radiusPx(raw: string, w: number, h: number): number {
  const first = raw.trim().split(/\s+/)[0] || "0"
  const n = parseFloat(first) || 0
  return first.endsWith("%") ? (n / 100) * Math.min(w, h) : n
}

/**
 * WHERE A THUMBNAIL'S PICTURE IS SEEN (round 32). Not the thumbnail's box: a picture drawn whole in it (object-contain, a
 * portrait photo alone in an opened post) is a narrower rectangle in the middle of it, and a picture cropped to fill it
 * (object-cover) is seen in the box, no further than the box clips it. With the corners it is rounded with there: a corner of
 * the picture that sits on a rounded corner of a box that clips it (the tile, the grid around it) takes that box's radius,
 * less how far in it sits (a 1px border). Null when it is not there to measure.
 */
export function pictureRect(tile: Element | null | undefined): { rect: DOMRect; corners: Corners } | null {
  if (!tile || !tile.isConnected) return null
  const box = tile.getBoundingClientRect()
  if (box.width < 4 || box.height < 4) return null
  const img = shownPicture(tile) ?? tile.querySelector("img")
  let left = box.left
  let top = box.top
  let right = box.right
  let bottom = box.bottom
  if (img) {
    const r = img.getBoundingClientRect()
    let c = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    const fit = getComputedStyle(img).objectFit
    if ((fit === "contain" || fit === "scale-down") && img.naturalWidth > 0 && img.naturalHeight > 0 && r.width > 0 && r.height > 0) {
      const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight, fit === "scale-down" ? 1 : Infinity)
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      c = { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, right: r.left + (r.width + w) / 2, bottom: r.top + (r.height + h) / 2 }
    }
    left = Math.max(left, c.left)
    top = Math.max(top, c.top)
    right = Math.min(right, c.right)
    bottom = Math.min(bottom, c.bottom)
  }
  if (right - left < 4 || bottom - top < 4) return null
  const rect = new DOMRect(left, top, right - left, bottom - top)
  const corners: Corners = [0, 0, 0, 0]
  const at: [number, number, "TopLeft" | "TopRight" | "BottomRight" | "BottomLeft"][] = [
    [left, top, "TopLeft"],
    [right, top, "TopRight"],
    [right, bottom, "BottomRight"],
    [left, bottom, "BottomLeft"],
  ]
  /* The tile and the boxes around it that clip, a few steps up (a grid's rounded corners are its own, not its tiles'). */
  let n: Element | null = img?.parentElement ?? tile
  for (let k = 0; n && k < 5; n = n.parentElement, k++) {
    const cs = getComputedStyle(n)
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue
    const nr = n.getBoundingClientRect()
    const bt = parseFloat(cs.borderTopWidth) || 0
    const br = parseFloat(cs.borderRightWidth) || 0
    const bb = parseFloat(cs.borderBottomWidth) || 0
    const bl = parseFloat(cs.borderLeftWidth) || 0
    at.forEach(([x, y, which], i) => {
      const r = radiusPx(cs.getPropertyValue(`border-${which.replace(/([A-Z])/g, "-$1").toLowerCase().slice(1)}-radius`), nr.width, nr.height)
      if (!r) return
      const leftSide = which.endsWith("Left")
      const topSide = which.startsWith("Top")
      const cx = leftSide ? nr.left + bl : nr.right - br
      const cy = topSide ? nr.top + bt : nr.bottom - bb
      const dx = Math.abs(x - cx)
      const dy = Math.abs(y - cy)
      if (dx > 1.5 || dy > 1.5) return
      const inner = r - Math.max(leftSide ? bl : br, topSide ? bt : bb) - Math.max(dx, dy)
      corners[i] = Math.max(corners[i], inner)
    })
  }
  return { rect, corners }
}

/**
 * THE THUMBNAIL STEPS ASIDE WHILE ITS PICTURE IS OPEN (round 32). Its pictures are hidden (visibility, so nothing is laid out
 * again and the tile keeps its ground), and the function returned shows them again: called in the frame the copy lands on
 * it, so there is one picture on screen at every frame of the way in, the time open and the way out.
 */
export function hideOrigin(tile: Element | null | undefined): () => void {
  if (!tile) return () => {}
  const imgs = Array.from(tile.querySelectorAll<HTMLElement>("img"))
  const was = imgs.map((el) => el.style.visibility)
  for (const el of imgs) el.style.visibility = "hidden"
  tile.setAttribute("data-viewer-origin", "")
  let shown = false
  return () => {
    if (shown) return
    shown = true
    imgs.forEach((el, i) => (el.style.visibility = was[i]))
    tile.removeAttribute("data-viewer-origin")
  }
}

/** Copies still covering a slide after their way in, waiting for the large picture: each one's way off. */
const HELD = new WeakMap<Element, () => void>()

/** Takes away a way in's copy that is still waiting for the large picture (a finger on the viewer, a close), showing the picture. */
export function releaseMorph(host: Element | null | undefined): void {
  if (!host) return
  for (const box of Array.from(host.querySelectorAll('[data-cover-morph="in"]'))) HELD.get(box)?.()
}

/**
 * Fly ONE picture between `thumb` (where the thumbnail's picture is seen, pictureRect) and `laid` (where the picture is
 * laid out whole in the viewer), in `host` (a fixed layer over the screen, so its coordinates are the screen's). `way`
 * says which end it starts at. The picture is a copy in a box that clips: the box moves and stretches (translate and scale,
 * on the compositor) from the thumbnail's rectangle to the picture's own, and the picture inside is scaled back by the
 * stretch (scale), so it is cropped as the thumbnail crops it and never squashed. The box's corners go from the
 * thumbnail's (`corners`) to square, written against its stretch so they stay round on screen. Nothing fades.
 *
 * The real picture is hidden while the copy flies. A way in keeps the copy over the slide until the real picture is
 * decoded, then swaps them in one frame (releaseMorph does it at once); a way out lands exactly on the thumbnail, where
 * the caller shows the thumbnail again as the promise resolves (the same task, so the same frame). Resolves when it has
 * landed.
 */
export function coverMorph(opts: {
  host: HTMLElement
  img: HTMLImageElement
  thumb: DOMRect
  laid: DOMRect
  way: "in" | "out"
  ms: number
  easing: string
  /** Where the picture is seen at the start of a way out, when a pull has moved it from where it is laid. */
  from?: { dx: number; dy: number; s: number }
  /** The thumbnail's own picture, already loaded: flown instead while the large one is still on its way. */
  fallback?: HTMLImageElement | null
  /** The thumbnail's rounded corners, in screen pixels (pictureRect). */
  corners?: Corners
}): Promise<void> {
  const { host, img, thumb, laid, way, ms } = opts
  const ease = easeOf(opts.easing)
  const corners = opts.corners ?? SQUARE
  const box = document.createElement("div")
  box.setAttribute("data-cover-morph", way)
  box.setAttribute("aria-hidden", "true")
  Object.assign(box.style, {
    position: "fixed",
    left: `${laid.left}px`,
    top: `${laid.top}px`,
    width: `${laid.width}px`,
    height: `${laid.height}px`,
    overflow: "hidden",
    /* Scaled about its centre: the default origin, so none is set. */
    pointerEvents: "none",
    willChange: "translate, scale",
    contain: "strict",
  } as Partial<CSSStyleDeclaration>)
  const pic = document.createElement("img")
  const ready = img.complete && img.naturalWidth > 0
  const spare = opts.fallback && opts.fallback.complete && opts.fallback.naturalWidth > 0 ? opts.fallback : null
  pic.src = ready || !spare ? img.currentSrc || img.src : spare.currentSrc || spare.src
  if (!ready && spare?.referrerPolicy) pic.referrerPolicy = spare.referrerPolicy
  pic.alt = ""
  pic.decoding = "sync"
  pic.draggable = false
  Object.assign(pic.style, {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    willChange: "scale",
  } as Partial<CSSStyleDeclaration>)
  /* Standard dynamic range, as the real one is drawn (media.tsx SDR); the dark look's slight dimming reaches it as any picture. */
  pic.style.setProperty("dynamic-range-limit", "standard")
  box.appendChild(pic)
  host.appendChild(box)

  /* The thumbnail's end: the box squeezed onto the picture as the thumbnail shows it, the picture inside scaled back to cover it. */
  const sx0 = thumb.width / laid.width
  const sy0 = thumb.height / laid.height
  const tx0 = thumb.left + thumb.width / 2 - (laid.left + laid.width / 2)
  const ty0 = thumb.top + thumb.height / 2 - (laid.top + laid.height / 2)
  /* The laid end: where the picture is, or where a pull left it. */
  const f = opts.from ?? { dx: 0, dy: 0, s: 1 }
  const boxFrames: Keyframe[] = []
  const picFrames: Keyframe[] = []
  const roundFrames: Keyframe[] = []
  const round = corners.some((c) => c > 0.5)
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    /* k = 0 at the thumbnail, 1 at the laid picture. */
    const e = ease(t)
    const k = way === "in" ? e : 1 - e
    const sx = sx0 + (f.s - sx0) * k
    const sy = sy0 + (f.s - sy0) * k
    const tx = tx0 + (f.dx - tx0) * k
    const ty = ty0 + (f.dy - ty0) * k
    const cover = Math.max(sx, sy)
    boxFrames.push({ offset: t, translate: `${tx.toFixed(2)}px ${ty.toFixed(2)}px`, scale: `${sx.toFixed(5)} ${sy.toFixed(5)}` })
    picFrames.push({ offset: t, scale: `${(cover / sx).toFixed(5)} ${(cover / sy).toFixed(5)}` })
    if (round) {
      /* The corner on screen, written in the box's own (stretched) pixels: across by the width's stretch, down by the height's. */
      const on = corners.map((c) => c * (1 - k))
      const across = on.map((c) => `${(c / sx).toFixed(2)}px`).join(" ")
      const down = on.map((c) => `${(c / sy).toFixed(2)}px`).join(" ")
      roundFrames.push({ offset: t, borderRadius: `${across} / ${down}` })
    }
  }
  const prevVisibility = img.style.visibility
  img.style.visibility = "hidden"
  /* Three animations, so the moves stay on the compositor whatever the corners do. */
  const a = box.animate(boxFrames, { duration: ms, easing: "linear", fill: "forwards" })
  pic.animate(picFrames, { duration: ms, easing: "linear", fill: "forwards" })
  if (round) box.animate(roundFrames, { duration: ms, easing: "linear", fill: "forwards" })
  return new Promise((resolve) => {
    let landed = false
    let gone = false
    const off = () => {
      if (gone) return
      gone = true
      HELD.delete(box)
      if (way === "in") img.style.visibility = prevVisibility
      box.remove()
    }
    const land = () => {
      if (landed) return
      landed = true
      if (way === "out") {
        off()
        resolve()
        return
      }
      /* The large picture in place of the copy once it can be drawn: decoded, so the frame it shows in is never empty. */
      HELD.set(box, off)
      resolve()
      const swap = () => {
        if (!img.isConnected) return off()
        if (img.complete && img.naturalWidth > 0 && typeof img.decode === "function") img.decode().then(off, off)
        else off()
      }
      if (img.complete) swap()
      else {
        img.addEventListener("load", swap, { once: true })
        img.addEventListener("error", off, { once: true })
      }
    }
    a.onfinish = land
    a.oncancel = land
    /* A tab in the background draws no frames: it still lands. */
    window.setTimeout(land, ms + 200)
  })
}

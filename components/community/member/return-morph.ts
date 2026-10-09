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

/**
 * Fly a copy of `img` between `thumb` (where the thumbnail is, cropped to
 * fill it) and `laid` (where the picture is laid out whole), in `host` (a
 * fixed layer over the screen, so its coordinates are the screen's). `way`
 * says which end it starts at. The copy is a box that clips (translate and
 * scale) holding the picture scaled back by the box's stretch (scale), so
 * the picture is cropped, never squashed. The real picture is hidden while
 * the copy flies and shown again at the end of a way in; the copy fades into
 * the thumbnail over the last stretch of a way out, so the thumbnail's own
 * round corners take over. Resolves when it has landed.
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
}): Promise<void> {
  const { host, img, thumb, laid, way, ms } = opts
  const ease = easeOf(opts.easing)
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
    transformOrigin: "50% 50%",
    pointerEvents: "none",
    willChange: "translate, scale, opacity",
    contain: "strict",
  } as Partial<CSSStyleDeclaration>)
  const pic = document.createElement("img")
  const ready = img.complete && img.naturalWidth > 0
  const spare = opts.fallback && opts.fallback.complete && opts.fallback.naturalWidth > 0 ? opts.fallback : null
  pic.src = ready || !spare ? img.currentSrc || img.src : spare.currentSrc || spare.src
  pic.alt = ""
  pic.decoding = "sync"
  Object.assign(pic.style, {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    transformOrigin: "50% 50%",
    willChange: "scale",
  } as Partial<CSSStyleDeclaration>)
  box.appendChild(pic)
  host.appendChild(box)

  /* The thumbnail's end: the box squeezed onto the thumbnail, the picture inside scaled back to cover it. */
  const sx0 = thumb.width / laid.width
  const sy0 = thumb.height / laid.height
  const tx0 = thumb.left + thumb.width / 2 - (laid.left + laid.width / 2)
  const ty0 = thumb.top + thumb.height / 2 - (laid.top + laid.height / 2)
  /* The laid end: where the picture is, or where a pull left it. */
  const f = opts.from ?? { dx: 0, dy: 0, s: 1 }
  const boxFrames: Keyframe[] = []
  const picFrames: Keyframe[] = []
  const fadeFrames: Keyframe[] = []
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
  }
  /* Into the thumbnail's own round corners over the last fifth of a way out, out of them over the first tenth of a way in. */
  if (way === "out") fadeFrames.push({ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 })
  else fadeFrames.push({ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1 })
  const prevVisibility = img.style.visibility
  img.style.visibility = "hidden"
  const a = box.animate(boxFrames, { duration: ms, easing: "linear", fill: "forwards" })
  pic.animate(picFrames, { duration: ms, easing: "linear", fill: "forwards" })
  box.animate(fadeFrames, { duration: ms, easing: "linear", fill: "forwards" })
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (way === "in") img.style.visibility = prevVisibility
      box.remove()
      resolve()
    }
    a.onfinish = finish
    a.oncancel = finish
    /* A tab in the background draws no frames: it still lands. */
    window.setTimeout(finish, ms + 200)
  })
}

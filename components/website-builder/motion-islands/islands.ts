/**
 * The motion islands that need no WebGL (round P, P3). Each is a factory
 * taking the runtime's context (./runtime.ts) and returning what it does per
 * frame and how it puts the markup back. Transform and opacity only, layout
 * read in `measure` and written in `frame`, nothing parsed as markup, no URL
 * taken from an attribute. The contract and every param's range:
 * lib/storelib-theme/motion-islands.ts.
 */
import { MOTION_PROGRESS_VAR, type ParamValue } from "@/lib/storelib-theme/motion-islands"
import { holdGlide, positioned, progressPinned, progressThrough, type Island, type IslandContext, type IslandFactory, type StaticSetup } from "./runtime"

const num = (v: ParamValue | undefined, d: number) => (typeof v === "number" ? v : d)
const str = (v: ParamValue | undefined, d: string) => (typeof v === "string" ? v : d)
const bool = (v: ParamValue | undefined, d: boolean) => (typeof v === "boolean" ? v : d)

/** Frame-rate independent easing toward a target: `k` is the share per 60fps frame. */
const approach = (from: number, to: number, k: number, dt: number) => from + (to - from) * (1 - Math.pow(1 - k, dt * 60))

/** Undo for inline style properties the island sets. */
function styleKeeper(el: HTMLElement, props: string[]): () => void {
  const was = props.map((p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)] as const)
  return () => {
    for (const [p, v, pr] of was) {
      if (v) el.style.setProperty(p, v, pr)
      else el.style.removeProperty(p)
    }
  }
}

/* ── scroll-scrub ─────────────────────────────────────────────────────── */

function scrubParts(el: HTMLElement) {
  const stage = el.querySelector<HTMLElement>("[data-motion-stage]") ?? el
  const video = el.querySelector<HTMLVideoElement>("video[data-motion-video]") ?? stage.querySelector<HTMLVideoElement>("video")
  const frames = Array.from(el.querySelectorAll<HTMLElement>("[data-motion-frame]"))
  return { stage, video, frames }
}

function stillIndex(still: string, count: number): number {
  return still === "last" ? count - 1 : still === "middle" ? Math.floor((count - 1) / 2) : 0
}

/** The still frame, marked: with reduced motion, on phones set to "still", and with motion off. */
export const scrollScrubStill: StaticSetup = (el, params) => {
  const { video, frames } = scrubParts(el)
  const still = str(params.still, "first")
  if (frames.length) {
    const f = frames[stillIndex(still, frames.length)]
    f.setAttribute("data-motion-active", "")
    return () => f.removeAttribute("data-motion-active")
  }
  if (video) {
    const seek = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0
      video.pause()
      video.currentTime = still === "last" ? Math.max(0, d - 0.05) : still === "middle" ? d / 2 : 0
    }
    if (video.readyState >= 1) seek()
    else video.addEventListener("loadedmetadata", seek, { once: true })
    return () => video.removeEventListener("loadedmetadata", seek)
  }
}

export const scrollScrub: IslandFactory = (ctx) => {
  const { el } = ctx
  const { stage, video, frames } = scrubParts(el)
  let target = 0
  let shown = -1
  let active: HTMLElement | null = null
  let lastSeek = -1
  if (video) {
    video.muted = true
    video.playsInline = true
    video.pause()
    if (video.preload !== "auto") video.preload = "auto"
  }
  /* Every frame decoded before it is needed, so a scrub never shows a blank. */
  frames.forEach((f) => {
    if (f instanceof HTMLImageElement) {
      if (f.loading === "lazy") f.loading = "eager"
      f.decode?.().catch(() => {})
    }
  })
  return {
    measure() {
      target = progressPinned(el.getBoundingClientRect(), ctx.viewport(), stage.offsetHeight || ctx.viewport().height)
    },
    frame(_t, dt) {
      const k = ctx.follow(dt)
      const next = shown < 0 ? target : shown + (target - shown) * k
      const settled = Math.abs(next - target) < 0.0005
      shown = settled ? target : next
      el.style.setProperty(MOTION_PROGRESS_VAR, shown.toFixed(4))
      if (frames.length) {
        const f = frames[Math.min(frames.length - 1, Math.round(shown * (frames.length - 1)))]
        if (f !== active) {
          active?.removeAttribute("data-motion-active")
          f.setAttribute("data-motion-active", "")
          active = f
        }
      } else if (video && Number.isFinite(video.duration) && video.duration > 0) {
        const at = shown * Math.max(0, video.duration - 0.05)
        /* One seek at a time: a decoder asked for every frame falls behind and stutters. */
        if (!video.seeking && Math.abs(at - lastSeek) > 1 / 90) {
          video.currentTime = at
          lastSeek = at
        }
        if (video.seeking) return true
      }
      return !settled
    },
    destroy() {
      active?.removeAttribute("data-motion-active")
    },
  }
}

/* ── pin-horizontal ───────────────────────────────────────────────────── */

export const pinHorizontal: IslandFactory = (ctx) => {
  const { el, params } = ctx
  const stage = el.querySelector<HTMLElement>("[data-motion-stage]")
  const track = el.querySelector<HTMLElement>("[data-motion-track]")
  if (!stage || !track) return { destroy() {} }
  const undoEl = styleKeeper(el, ["height"])
  const undoTrack = styleKeeper(track, ["transform", "will-change"])
  const speed = num(params.speed, 1)
  const rightward = str(params.direction, "left") === "right"
  let dist = 0
  let target = 0
  let shown = -1
  const size = () => {
    /* The ready attribute has just made the stage sticky and the track one row: measure that. */
    dist = Math.max(0, track.scrollWidth - stage.clientWidth)
    el.style.height = `${Math.round(dist * speed + stage.offsetHeight)}px`
    ctx.wake()
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(size) : null
  requestAnimationFrame(() => {
    size()
    ro?.observe(track)
    ro?.observe(stage)
  })
  track.style.willChange = "transform"
  return {
    measure() {
      target = progressPinned(el.getBoundingClientRect(), ctx.viewport(), stage.offsetHeight)
    },
    frame(_t, dt) {
      const k = ctx.follow(dt)
      shown = shown < 0 ? target : shown + (target - shown) * k
      const settled = Math.abs(shown - target) < 0.0005
      if (settled) shown = target
      const p = rightward ? 1 - shown : shown
      track.style.transform = `translate3d(${(-p * dist).toFixed(2)}px,0,0)`
      el.style.setProperty(MOTION_PROGRESS_VAR, shown.toFixed(4))
      return !settled
    },
    destroy() {
      ro?.disconnect()
      undoEl()
      undoTrack()
    },
  }
}

/* ── parallax-depth ───────────────────────────────────────────────────── */

export const parallaxDepth: IslandFactory = (ctx) => {
  const { el, params, mode, env } = ctx
  const layers = Array.from(el.querySelectorAll<HTMLElement>("[data-motion-depth]")).map((node) => {
    const d = Number(node.getAttribute("data-motion-depth"))
    return { node, depth: Number.isFinite(d) ? Math.max(-1, Math.min(1, d)) : 0, x: 0, y: 0, undo: styleKeeper(node, ["transform", "will-change"]) }
  })
  const strength = (num(params.intensity, 40) / 100) * (mode === "simple" ? 0.5 : 1)
  const usePointer = bool(params.pointer, true) && mode === "full" && env.finePointer
  const axis = str(params.axis, "vertical")
  let rect: DOMRect | null = null
  let c = 0
  let px = 0
  let py = 0
  layers.forEach((l) => { if (l.depth !== 0) l.node.style.willChange = "transform" })
  return {
    measure() {
      rect = el.getBoundingClientRect()
      c = progressThrough(rect, ctx.viewport()) * 2 - 1
      const p = ctx.pointer()
      if (usePointer && p && rect) {
        px = Math.max(-1, Math.min(1, (p.x - (rect.left + rect.width / 2)) / (rect.width / 2)))
        py = Math.max(-1, Math.min(1, (p.y - (rect.top + rect.height / 2)) / (rect.height / 2)))
      }
    },
    frame(_t, dt) {
      if (!rect) return false
      let moving = false
      const travel = rect.height * 0.22 * strength
      for (const l of layers) {
        if (l.depth === 0) continue
        const scrollY = axis === "horizontal" ? 0 : -c * travel * l.depth
        const scrollX = axis === "vertical" ? 0 : -c * travel * l.depth
        const tx = scrollX + (usePointer ? -px * 28 * strength * l.depth : 0)
        const ty = scrollY + (usePointer ? -py * 18 * strength * l.depth : 0)
        l.x = approach(l.x, tx, 0.18, dt)
        l.y = approach(l.y, ty, 0.18, dt)
        if (Math.abs(l.x - tx) > 0.1 || Math.abs(l.y - ty) > 0.1) moving = true
        l.node.style.transform = `translate3d(${l.x.toFixed(2)}px,${l.y.toFixed(2)}px,0)`
      }
      return moving
    },
    destroy() {
      layers.forEach((l) => l.undo())
    },
  }
}

/* ── 3d-tilt ──────────────────────────────────────────────────────────── */

export const tilt3d: IslandFactory = (ctx) => {
  const { el, params } = ctx
  const max = num(params.intensity, 8)
  const lift = num(params.scale, 102) / 100
  const persp = num(params.perspective, 900)
  const undo = styleKeeper(el, ["transform", "will-change"])
  const unpos = positioned(el)
  let glare: HTMLElement | null = el.querySelector<HTMLElement>("[data-motion-glare]")
  let ownGlare = false
  if (!glare && bool(params.glare, true)) {
    glare = ctx.own(document.createElement("span"))
    glare.setAttribute("aria-hidden", "true")
    glare.style.cssText = "position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;mix-blend-mode:soft-light;background:radial-gradient(circle at var(--glare-x,50%) var(--glare-y,50%),rgba(255,255,255,.75),rgba(255,255,255,0) 60%);z-index:1"
    el.append(glare)
    ownGlare = true
  }
  let tx = 0, ty = 0, rx = 0, ry = 0, ts = 1, s = 1, go = 0, g = 0
  let gx = 50, gy = 50
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width
    const ny = (e.clientY - r.top) / r.height
    ty = (nx - 0.5) * 2 * max
    tx = -(ny - 0.5) * 2 * max
    ts = lift
    go = 1
    gx = nx * 100
    gy = ny * 100
    ctx.wake()
  }
  const leave = () => {
    tx = 0; ty = 0; ts = 1; go = 0
    ctx.wake()
  }
  el.addEventListener("pointermove", move)
  el.addEventListener("pointerleave", leave)
  el.style.willChange = "transform"
  return {
    frame(_t, dt) {
      rx = approach(rx, tx, 0.14, dt)
      ry = approach(ry, ty, 0.14, dt)
      s = approach(s, ts, 0.14, dt)
      g = approach(g, go, 0.14, dt)
      el.style.transform = `perspective(${persp}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`
      if (glare) {
        glare.style.opacity = (g * 0.9).toFixed(3)
        glare.style.setProperty("--glare-x", `${gx.toFixed(1)}%`)
        glare.style.setProperty("--glare-y", `${gy.toFixed(1)}%`)
      }
      return Math.abs(rx - tx) + Math.abs(ry - ty) + Math.abs(s - ts) * 100 + Math.abs(g - go) > 0.02
    },
    destroy() {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      if (ownGlare) glare?.remove()
      undo()
      unpos()
    },
  }
}

/* ── marquee ──────────────────────────────────────────────────────────── */

/** A copy of an item for the loop: hidden from assistive tech, not focusable, nothing the editor or the sandbox counts. */
function loopCopy(ctx: IslandContext, item: Element): HTMLElement {
  const copy = ctx.own(item.cloneNode(true) as HTMLElement)
  copy.setAttribute("aria-hidden", "true")
  copy.setAttribute("inert", "")
  for (const n of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    n.removeAttribute("id")
    n.removeAttribute("data-sb")
    n.removeAttribute("data-block-id")
    n.removeAttribute("data-storelib-motion")
  }
  return copy
}

export const marquee: IslandFactory = (ctx) => {
  const { el, params } = ctx
  const track = el.querySelector<HTMLElement>("[data-motion-track]") ?? (el.firstElementChild as HTMLElement | null)
  if (!track) return { destroy() {} }
  const originals = Array.from(track.children) as HTMLElement[]
  if (originals.length === 0) return { destroy() {} }
  const undoTrack = styleKeeper(track, ["transform", "will-change", "flex-wrap", "width", "display"])
  const undoEl = styleKeeper(el, ["overflow"])
  if (getComputedStyle(el).overflow === "visible") el.style.overflow = "hidden"
  const disp = getComputedStyle(track).display
  if (disp !== "flex" && disp !== "inline-flex") track.style.display = "flex"
  track.style.flexWrap = "nowrap"
  track.style.width = "max-content"
  track.style.willChange = "transform"
  const copies: HTMLElement[] = []
  let setWidth = 0
  const fill = () => {
    copies.splice(0).forEach((c) => c.remove())
    const first = originals[0]
    const one = track.scrollWidth
    const need = Math.max(1, Math.ceil((el.clientWidth * 2) / Math.max(1, one)))
    for (let i = 0; i < need; i++) for (const o of originals) {
      const c = loopCopy(ctx, o)
      track.append(c)
      copies.push(c)
    }
    /* One set's width, gap included: where the first copy starts. */
    setWidth = copies[0] ? copies[0].offsetLeft - first.offsetLeft : one
  }
  fill()
  const speed = num(params.speed, 80)
  const base = str(params.direction, "left") === "right" ? 1 : -1
  const reactive = num(params.reactive, 50) / 100
  const flip = bool(params.flip, true)
  const pauseOnHover = bool(params.pause, true)
  let x = base > 0 ? -setWidth : 0
  let dir = base
  let boost = 1
  let lastTop = ctx.scrollTop()
  let velocity = 0
  let hovered = false
  const enter = () => { hovered = true }
  const leave = () => { hovered = false; ctx.wake() }
  if (pauseOnHover) {
    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    el.addEventListener("focusin", enter)
    el.addEventListener("focusout", leave)
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { fill(); ctx.wake() }) : null
  ro?.observe(el)
  return {
    measure() {
      const top = ctx.scrollTop()
      velocity = top - lastTop
      lastTop = top
    },
    frame(_t, dt) {
      if (dt > 0 && velocity !== 0) {
        const pxPerSec = velocity / dt
        if (flip) dir = pxPerSec > 0 ? base : -base
        boost = Math.max(boost, 1 + Math.min(6, (Math.abs(pxPerSec) / 600) * reactive * 4))
      }
      boost = approach(boost, 1, 0.06, dt)
      if (!hovered && setWidth > 0) {
        x += dir * speed * boost * dt
        if (x <= -setWidth) x += setWidth
        if (x > 0) x -= setWidth
        track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`
      }
      /* A marquee runs while it is on screen and not paused. */
      return !hovered
    },
    destroy() {
      ro?.disconnect()
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
      el.removeEventListener("focusin", enter)
      el.removeEventListener("focusout", leave)
      copies.forEach((c) => c.remove())
      undoTrack()
      undoEl()
    },
  }
}

/* ── text-scramble ────────────────────────────────────────────────────── */

const GLYPHS: Record<string, string> = {
  letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!<>-_\\/[]{}=+*^?#%&$@",
  binary: "01",
}

export const textScramble: IslandFactory = (ctx) => {
  const { el, params } = ctx
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; text: string }[] = []
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const node = t as Text
    if (!node.data.trim() || node.parentElement?.closest("[data-storelib-motion-node], script, style")) continue
    nodes.push({ node, text: node.data })
  }
  const duration = num(params.duration, 900) / 1000
  const glyphs = GLYPHS[str(params.chars, "letters")] ?? GLYPHS.letters
  const trigger = str(params.trigger, "view")
  const once = bool(params.once, true)
  let startAt = -1
  let played = false
  let pending = trigger === "load" || trigger === "view" || trigger === "both"
  let paused = false
  let inView = false
  let lastStep = 0
  const total = nodes.reduce((a, n) => a + n.text.length, 0)
  /* Each character settles at its own moment, left to right with a little noise, fixed per play. */
  let settle: number[] = []
  const restore = () => {
    nodes.forEach((n) => { if (n.node.data !== n.text) n.node.data = n.text })
    el.removeAttribute("aria-busy")
  }
  const play = () => {
    if (paused || (once && played)) return
    settle = Array.from({ length: total }, (_, i) => (i / Math.max(1, total)) * duration * 0.7 + Math.random() * duration * 0.3)
    startAt = -1
    played = true
    el.setAttribute("aria-busy", "true")
    ctx.wake()
  }
  const hover = () => play()
  if (trigger === "hover" || trigger === "both") el.addEventListener("pointerenter", hover)
  return {
    measure() {
      const r = el.getBoundingClientRect()
      const vp = ctx.viewport()
      inView = r.top < vp.top + vp.height && r.bottom > vp.top
    },
    frame(t) {
      if (paused) return false
      if (pending && inView) {
        pending = false
        play()
      }
      if (!el.hasAttribute("aria-busy")) return false
      if (startAt < 0) startAt = t
      const at = t - startAt
      /* About 25 changes a second: faster reads as flicker, not decoding. */
      if (at - lastStep < 0.04 && at < duration) return true
      lastStep = at
      let i = 0
      let done = true
      for (const n of nodes) {
        let out = ""
        for (const ch of n.text) {
          if (ch.trim() === "" || at >= settle[i]) out += ch
          else {
            done = false
            out += glyphs[Math.floor(Math.random() * glyphs.length)]
          }
          i++
        }
        if (n.node.data !== out) n.node.data = out
      }
      if (done) {
        restore()
        if (!once) played = false
        return false
      }
      return true
    },
    pause(on) {
      paused = on
      if (on) restore()
    },
    destroy() {
      el.removeEventListener("pointerenter", hover)
      restore()
    },
  }
}

/* ── reveal-stagger ───────────────────────────────────────────────────── */

const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)"

export const revealStagger: IslandFactory = (ctx) => {
  const { el, params, mode } = ctx
  const marked = Array.from(el.querySelectorAll<HTMLElement>("[data-motion-item]"))
  const items = marked.length ? marked : (Array.from(el.children) as HTMLElement[]).filter((c) => !c.hasAttribute("data-storelib-motion-node"))
  const effect = str(params.effect, "rise")
  const stagger = num(params.stagger, 65)
  const distance = num(params.distance, 24) * (mode === "simple" ? 0.6 : 1)
  const duration = num(params.duration, 650)
  const once = bool(params.once, true)
  const ease = getComputedStyle(el).getPropertyValue("--t-motion-ease").trim() || EASE
  const hiddenTransform = effect === "scale" ? "scale(0.94)" : effect === "slide-left" ? `translate3d(${distance}px,0,0)` : effect === "slide-right" ? `translate3d(${-distance}px,0,0)` : effect === "fade" ? "" : `translate3d(0,${distance}px,0)`
  const undos = items.map((i) => styleKeeper(i, ["transform", "transition"]))
  const vp = ctx.viewport()
  /* Only what is still below the fold waits; what the visitor can already see is never hidden. */
  const waiting = new Set(items.filter((i) => i.getBoundingClientRect().top > vp.top + vp.height))
  const hide = (i: HTMLElement) => {
    i.style.transition = "none"
    i.setAttribute("data-motion-pending", "")
    if (hiddenTransform) i.style.transform = hiddenTransform
  }
  waiting.forEach(hide)
  const timers: number[] = []
  const show = () => {
    let n = 0
    for (const i of items) {
      if (!i.hasAttribute("data-motion-pending")) continue
      const delay = n++ * stagger
      i.style.transition = `opacity ${duration}ms ${ease} ${delay}ms, transform ${duration}ms ${ease} ${delay}ms`
      i.removeAttribute("data-motion-pending")
      i.style.transform = ""
      timers.push(window.setTimeout(() => { i.style.removeProperty("transition") }, duration + delay + 50))
    }
  }
  const io = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) show()
          else if (!once && e.boundingClientRect.top > 0) items.forEach(hide)
        }
      }, { threshold: 0.12 })
    : null
  if (waiting.size) io?.observe(el)
  else if (!once) io?.observe(el)
  if (!io) show()
  return {
    destroy() {
      io?.disconnect()
      timers.forEach((t) => clearTimeout(t))
      items.forEach((i) => i.removeAttribute("data-motion-pending"))
      undos.forEach((u) => u())
    },
  }
}

/* ── smooth-scroll ────────────────────────────────────────────────────── */

let anchorsHeld = 0
let anchorsWas = ""

/**
 * Page level and never a takeover: the page keeps its native scroll (wheel,
 * touch, keyboard, scrollbar, find in page and restoration all work). What
 * changes is that scroll-linked islands glide to the scroll position
 * instead of jumping, and in-page links travel.
 */
export const smoothScroll: IslandFactory = (ctx) => {
  const { params, mode } = ctx
  const release = mode === "full" ? holdGlide(num(params.damping, 0.12)) : () => {}
  const anchors = bool(params.anchors, true)
  const root = document.documentElement
  if (anchors) {
    if (anchorsHeld++ === 0) {
      anchorsWas = root.style.scrollBehavior
      root.style.scrollBehavior = "smooth"
    }
  }
  return {
    destroy() {
      release()
      if (anchors && --anchorsHeld === 0) root.style.scrollBehavior = anchorsWas
    },
  }
}

/* ── image-trail ──────────────────────────────────────────────────────── */

export const imageTrail: IslandFactory = (ctx) => {
  const { el, params } = ctx
  const list = el.querySelector<HTMLElement>("[data-motion-images]")
  const pool = Array.from((list ?? el).querySelectorAll<HTMLImageElement>("img"))
  if (!list || pool.length === 0) return { destroy() {} }
  const threshold = num(params.threshold, 80)
  const lifetime = num(params.lifetime, 900)
  const max = Math.min(num(params.max, 7), pool.length * 2)
  const size = num(params.size, 180)
  const tilt = num(params.rotate, 8)
  const undos = pool.map((img) => styleKeeper(img, ["transform", "width", "height", "opacity", "z-index"]))
  let next = 0
  let z = 3
  let lastX = NaN
  let lastY = NaN
  const live: Animation[] = []
  const spawn = (x: number, y: number) => {
    const img = pool[next++ % pool.length]
    if (!img.complete || img.naturalWidth === 0) return
    const w = size
    const h = Math.round(size * (img.naturalHeight / img.naturalWidth))
    img.style.width = `${w}px`
    img.style.height = `${h}px`
    img.style.zIndex = String(z++)
    const r = (Math.random() * 2 - 1) * tilt
    const at = `translate3d(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px,0) rotate(${r.toFixed(1)}deg)`
    img.getAnimations().forEach((a) => a.cancel())
    const a = img.animate(
      [
        { opacity: 0, transform: `${at} scale(0.6)` }, // i18n-ignore: a CSS transform, not words
        { opacity: 1, transform: `${at} scale(1)`, offset: 0.15 }, // i18n-ignore: a CSS transform, not words
        { opacity: 1, transform: `${at} scale(1)`, offset: 0.7 }, // i18n-ignore: a CSS transform, not words
        { opacity: 0, transform: `${at} scale(0.92)` }, // i18n-ignore: a CSS transform, not words
      ],
      { duration: lifetime + 450, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" },
    )
    live.push(a)
    while (live.length > max) live.shift()?.cancel()
    a.onfinish = () => { const i = live.indexOf(a); if (i >= 0) live.splice(i, 1) }
  }
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return
    const r = list.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (Number.isNaN(lastX) || Math.hypot(x - lastX, y - lastY) >= threshold) {
      lastX = x
      lastY = y
      spawn(x, y)
    }
  }
  const leave = () => { lastX = NaN; lastY = NaN }
  el.addEventListener("pointermove", move)
  el.addEventListener("pointerleave", leave)
  return {
    destroy() {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      pool.forEach((img) => img.getAnimations().forEach((a) => a.cancel()))
      undos.forEach((u) => u())
    },
  }
}

/* ── cursor-follow ────────────────────────────────────────────────────── */

export const cursorFollow: IslandFactory = (ctx) => {
  const { el, params } = ctx
  const unpos = positioned(el)
  const size = num(params.size, 72)
  const lag = num(params.lag, 0.8)
  let follower = el.querySelector<HTMLElement>("[data-motion-follower]")
  const made = !follower
  if (!follower) {
    follower = ctx.own(document.createElement("span"))
    follower.setAttribute("aria-hidden", "true")
    /* Words only, as text: the label param is plain and short (motion-islands.ts parseParam). */
    follower.textContent = str(params.label, "View") // i18n-ignore: the visitor-facing default of a label the creator sets on the section
    follower.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;display:grid;place-items:center;background:var(--s-accent,#111);color:var(--s-btn-text,#fff);font:600 13px/1 var(--theme-font-body,inherit);letter-spacing:.01em;pointer-events:none;z-index:5;transition:opacity .2s,scale .25s;opacity:0;scale:.4`
    if (str(params.blend, "normal") === "difference") follower.style.mixBlendMode = "difference"
    el.append(follower)
  }
  const f = follower
  const undoF = made ? () => {} : styleKeeper(f, ["transform", "opacity", "scale", "pointer-events"])
  if (!made) f.style.pointerEvents = "none"
  let x = 0, y = 0, tx = 0, ty = 0, inside = false, placed = false
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return
    const r = el.getBoundingClientRect()
    tx = e.clientX - r.left
    ty = e.clientY - r.top
    if (!placed) { x = tx; y = ty; placed = true }
    if (!inside) {
      inside = true
      f.style.opacity = "1"
      f.style.scale = "1"
    }
    ctx.wake()
  }
  const leave = () => {
    inside = false
    placed = false
    f.style.opacity = "0"
    f.style.scale = ".4"
  }
  el.addEventListener("pointermove", move)
  el.addEventListener("pointerleave", leave)
  return {
    frame(_t, dt) {
      if (!inside) return false
      x = approach(x, tx, 1 - lag, dt)
      y = approach(y, ty, 1 - lag, dt)
      f.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
      return Math.abs(x - tx) + Math.abs(y - ty) > 0.2
    },
    destroy() {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      if (made) f.remove()
      else undoF()
      unpos()
    },
  }
}

/* ── 3d-object: the loader (three.js comes with ./object-3d only) ─────── */

/** The picture is the still state: nothing to set up. Without one, the island's own markup is. */
export const object3dStill: StaticSetup = () => {}

export const object3dLoader: IslandFactory = async (ctx) => {
  const m = await import("./object-3d")
  return m.object3d(ctx)
}


/**
 * ===========================================================================
 *  THE MOTION ISLANDS RUNTIME (round P, P3)
 * ===========================================================================
 * First-party code, reviewed and shipped by Storelib, that brings a section's
 * `data-storelib-motion` marks to life on the live site and on the builder's
 * canvas. The contract (what may be asked for, every param's range) is
 * lib/storelib-theme/motion-islands.ts; this file is the browser half.
 *
 * WHAT IT NEVER DOES. It never runs anything from the markup: no
 * innerHTML, no eval, no URL taken from an attribute, no script element
 * made. It reads attributes as numbers, words and colours, moves elements
 * the section already drew with transform and opacity, and adds its own
 * nodes (a canvas, a marquee's hidden copies, a cursor label) marked
 * data-storelib-motion-node so the section sandbox's numbering skips them.
 *
 * HOW IT RUNS. One requestAnimationFrame loop for the whole page, running
 * only while an island that is on screen has something to do; one
 * IntersectionObserver for visibility; scroll and pointer listeners that
 * only record and wake the loop. Islands read layout in `measure` and write
 * in `frame`, so a frame never reads after a write. A hidden tab, an island
 * off screen and a text field being typed into on the canvas all pause it.
 *
 * WHEN IT STANDS STILL. prefers-reduced-motion, update: slow, O5's
 * data-motion="off", WebGL missing or a low-power device (for the WebGL
 * islands), a touch screen (for the hover islands): the island keeps its own
 * markup (lib/storelib-theme/motion-islands.ts motionMode).
 *
 * three.js is imported only by ./object-3d.ts, which is imported only when a
 * page has a 3d-object island that can run.
 */
import {
  MAX_GL_ISLANDS,
  MOTION_ATTR,
  MOTION_ISLANDS,
  MOTION_NODE_ATTR,
  MOTION_PROGRESS_VAR,
  MOTION_READY_ATTR,
  motionMode,
  parseMotionKind,
  parseMotionParams,
  type MotionEnvironment,
  type MotionIslandKind,
  type MotionMode,
  type ParamValue,
} from "@/lib/storelib-theme/motion-islands"

/* ── what an island is to the runtime ─────────────────────────────────── */

export interface IslandContext {
  el: HTMLElement
  kind: MotionIslandKind
  params: Record<string, ParamValue>
  mode: Exclude<MotionMode, "static">
  env: MotionEnvironment
  /** Marks a node the runtime made, so the sandbox's numbering and the editor skip it. */
  own<T extends Element>(node: T): T
  /** The visible area the island scrolls through (the canvas's scroller, or the window). */
  viewport(): { top: number; height: number; width: number }
  /** The scroller's scroll position, for velocity. */
  scrollTop(): number
  /** The pointer, in client coordinates, or null before it moved. */
  pointer(): { x: number; y: number } | null
  /** Ask for frames (after an event changed something). */
  wake(): void
  /** How fast a scroll-linked value follows its target this frame (1 = at once; smooth-scroll lowers it). */
  follow(dt: number): number
}

export interface Island {
  /** Read layout. Called for every running island before any frame. */
  measure?(): void
  /** Write. Return true to be called again next frame. */
  frame?(t: number, dt: number): boolean
  /** Editing text on the canvas started (true) or stopped. */
  pause?(on: boolean): void
  destroy(): void
}

export type IslandFactory = (ctx: IslandContext) => Island | Promise<Island>
/** The still state of an island that needs one set up (a scrub's still frame, a gradient's CSS). */
export type StaticSetup = (el: HTMLElement, params: Record<string, ParamValue>, env: MotionEnvironment) => (() => void) | void

/* ── the environment ─────────────────────────────────────────────────── */

let webglProbe: boolean | null = null

/** Whether a hardware WebGL context can be made here (software rendering counts as no). */
export function hasWebGL(): boolean {
  if (webglProbe !== null) return webglProbe
  try {
    const c = document.createElement("canvas")
    const gl = (c.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ?? c.getContext("webgl", { failIfMajorPerformanceCaveat: true })) as WebGLRenderingContext | null
    webglProbe = !!gl
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
  } catch {
    webglProbe = false
  }
  return webglProbe
}

function media(q: string): boolean {
  return typeof matchMedia === "function" && matchMedia(q).matches
}

export function detectEnv(inCanvas: boolean): MotionEnvironment {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  const lowPower = nav.connection?.saveData === true || (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) || (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2)
  return {
    reducedMotion: media("(prefers-reduced-motion: reduce)") || media("(update: slow)"),
    lowPower,
    mobile: media("(max-width: 600px)") || media("(pointer: coarse)"),
    finePointer: media("(hover: hover) and (pointer: fine)"),
    webgl: hasWebGL(),
    inCanvas,
  }
}

/** A test, or a page that knows better, may pin the environment: window.__storelibMotionEnv = { lowPower: true }. */
function envFor(inCanvas: boolean): MotionEnvironment {
  const env = detectEnv(inCanvas)
  const pinned = (globalThis as { __storelibMotionEnv?: Partial<MotionEnvironment> }).__storelibMotionEnv
  return pinned ? { ...env, ...pinned, inCanvas } : env
}

/* ── the page's one loop ──────────────────────────────────────────────── */

interface Running {
  island: Island
  el: HTMLElement
  visible: boolean
  awake: boolean
}

const running = new Set<Running>()
let raf = 0
let last = 0
let pointerAt: { x: number; y: number } | null = null
let editing = false
let listening = false
/** smooth-scroll's glide (0..1 per 60fps frame), or 1 when no island asked for one. */
let glide = 1
let glideOwners = 0

function anyAwake(): boolean {
  if (editing || (typeof document !== "undefined" && document.hidden)) return false
  for (const r of running) if (r.visible && r.awake) return true
  return false
}

function tick(now: number) {
  raf = 0
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
  last = now
  const live = [...running].filter((r) => r.visible && r.awake)
  for (const r of live) r.island.measure?.()
  for (const r of live) r.awake = r.island.frame ? r.island.frame(now / 1000, dt) : false
  if (anyAwake()) raf = requestAnimationFrame(tick)
  else last = 0
}

function wakeAll() {
  for (const r of running) r.awake = true
  schedule()
}

function schedule() {
  if (!raf && anyAwake()) raf = requestAnimationFrame(tick)
}

const io: IntersectionObserver | null =
  typeof IntersectionObserver === "function"
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) for (const r of running) if (r.el === e.target) { r.visible = e.isIntersecting; if (r.visible) r.awake = true }
          schedule()
        },
        { rootMargin: "25% 0px 25% 0px" },
      )
    : null

const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable=false])"

function onFocus() {
  const now = !!(document.activeElement && (document.activeElement as HTMLElement).closest?.(TYPING))
  if (now === editing) return
  editing = now
  for (const r of running) r.island.pause?.(editing)
  if (!editing) wakeAll()
}
let canvasCount = 0

function listen() {
  if (listening) return
  listening = true
  document.addEventListener("scroll", wakeAll, { capture: true, passive: true })
  window.addEventListener("resize", wakeAll, { passive: true })
  window.addEventListener("pointermove", onPointer, { passive: true })
  document.addEventListener("visibilitychange", wakeAll)
}

function unlisten() {
  if (!listening || running.size > 0) return
  listening = false
  document.removeEventListener("scroll", wakeAll, { capture: true })
  window.removeEventListener("resize", wakeAll)
  window.removeEventListener("pointermove", onPointer)
  document.removeEventListener("visibilitychange", wakeAll)
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function onPointer(e: PointerEvent) {
  pointerAt = { x: e.clientX, y: e.clientY }
  wakeAll()
}

/** smooth-scroll's hold on the glide, released by the function it returns. */
export function holdGlide(damping: number): () => void {
  glideOwners++
  glide = Math.min(1, Math.max(0.02, damping))
  return () => {
    glideOwners = Math.max(0, glideOwners - 1)
    if (glideOwners === 0) glide = 1
  }
}

/* ── the scroller an island is in ─────────────────────────────────────── */

function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && p.scrollHeight > p.clientHeight + 1) return p
  }
  return null
}

/* ── islands by kind ──────────────────────────────────────────────────── */

type Loader = () => Promise<{ factory: IslandFactory; still?: StaticSetup }>

/**
 * The islands, each loaded when a page first asks for it. The light ones
 * share one module; the WebGL gradient is its own; the 3D object is the
 * only one that imports three.js.
 */
const LOADERS: Record<MotionIslandKind, Loader> = {
  "scroll-scrub": () => import("./islands").then((m) => ({ factory: m.scrollScrub, still: m.scrollScrubStill })),
  "pin-horizontal": () => import("./islands").then((m) => ({ factory: m.pinHorizontal })),
  "parallax-depth": () => import("./islands").then((m) => ({ factory: m.parallaxDepth })),
  "3d-tilt": () => import("./islands").then((m) => ({ factory: m.tilt3d })),
  marquee: () => import("./islands").then((m) => ({ factory: m.marquee })),
  "text-scramble": () => import("./islands").then((m) => ({ factory: m.textScramble })),
  "reveal-stagger": () => import("./islands").then((m) => ({ factory: m.revealStagger })),
  "smooth-scroll": () => import("./islands").then((m) => ({ factory: m.smoothScroll })),
  "image-trail": () => import("./islands").then((m) => ({ factory: m.imageTrail })),
  "cursor-follow": () => import("./islands").then((m) => ({ factory: m.cursorFollow })),
  "webgl-gradient": () => import("./webgl-gradient").then((m) => ({ factory: m.webglGradient, still: m.webglGradientStill })),
  "3d-object": () => import("./islands").then((m) => ({ factory: m.object3dLoader, still: m.object3dStill })),
}

/** Every island element under `root`, `root` included. */
export function islandElements(root: ParentNode & Node): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(`[${MOTION_ATTR}]`))
  if (root instanceof HTMLElement && root.hasAttribute(MOTION_ATTR)) all.unshift(root)
  /* Not one the runtime itself drew (a marquee's copy of an island inside it). */
  return all.filter((el) => !el.closest(`[${MOTION_NODE_ATTR}]`))
}

/** WebGL islands running on the page now, across sections. */
let glInUse = 0

export interface MountOptions {
  inCanvas: boolean
  /** Called with each island's kind and the mode it got (for tests and the canvas's own diagnostics). */
  onMode?: (el: HTMLElement, kind: MotionIslandKind, mode: MotionMode) => void
}

/**
 * Starts every island under `root`. Returns the function that stops them
 * all and puts the markup back as it was drawn.
 */
export function mountMotionIslands(root: HTMLElement, opts: MountOptions): () => void {
  if (typeof window === "undefined") return () => {}
  let alive = true
  const cleanups: (() => void)[] = []
  let env = envFor(opts.inCanvas)

  const start = () => {
    for (const el of islandElements(root)) {
      const kind = parseMotionKind(el.getAttribute(MOTION_ATTR))
      if (!kind) continue
      const params = parseMotionParams(kind, (a) => el.getAttribute(a))
      const off = !!el.closest('[data-motion="off"]')
      const spec = MOTION_ISLANDS[kind]
      const mode = motionMode(kind, env, { off, glSlotsLeft: MAX_GL_ISLANDS - glInUse, params })
      opts.onMode?.(el, kind, mode)
      el.setAttribute("data-motion-mode", mode)
      cleanups.push(() => el.removeAttribute("data-motion-mode"))
      if (mode === "static") {
        void LOADERS[kind]().then(({ still }) => {
          if (!alive || !still) return
          const undo = still(el, params, env)
          if (undo) cleanups.push(undo)
        })
        continue
      }
      if (spec.webgl) {
        glInUse++
        cleanups.push(() => { glInUse = Math.max(0, glInUse - 1) })
      }
      const scroller = scrollerOf(el)
      const record: Running = { island: { destroy() {} }, el, visible: false, awake: true }
      const ctx: IslandContext = {
        el,
        kind,
        params,
        mode,
        env,
        own(node) {
          node.setAttribute(MOTION_NODE_ATTR, kind)
          return node
        },
        viewport() {
          if (scroller) {
            const r = scroller.getBoundingClientRect()
            return { top: r.top, height: scroller.clientHeight, width: scroller.clientWidth }
          }
          return { top: 0, height: window.innerHeight, width: window.innerWidth }
        },
        scrollTop: () => (scroller ? scroller.scrollTop : window.scrollY),
        pointer: () => pointerAt,
        wake() {
          record.awake = true
          schedule()
        },
        follow(dt) {
          if (glide >= 1) return 1
          return 1 - Math.pow(1 - glide, dt * 60)
        },
      }
      void LOADERS[kind]()
        .then(({ factory }) => factory(ctx))
        .then((island) => {
          if (!alive) {
            island.destroy()
            return
          }
          record.island = island
          el.setAttribute(MOTION_READY_ATTR, "")
          running.add(record)
          listen()
          io?.observe(el)
          if (!io) record.visible = true
          if (editing) island.pause?.(true)
          schedule()
          cleanups.push(() => {
            io?.unobserve(el)
            running.delete(record)
            el.removeAttribute(MOTION_READY_ATTR)
            el.style.removeProperty(MOTION_PROGRESS_VAR)
            island.destroy()
            unlisten()
          })
        })
        .catch(() => {
          /* An island that could not start leaves its markup as it is: the still state. */
        })
    }
  }

  const stopAll = () => {
    for (const c of cleanups.splice(0).reverse()) {
      try { c() } catch { /* keep going: every other island still has to be put back */ }
    }
  }

  start()

  /* The visitor's settings can change while the page is open: start again with the new ones. */
  const queries = ["(prefers-reduced-motion: reduce)", "(max-width: 600px)", "(hover: hover) and (pointer: fine)"].map((q) => (typeof matchMedia === "function" ? matchMedia(q) : null))
  const onChange = () => {
    if (!alive) return
    stopAll()
    env = envFor(opts.inCanvas)
    start()
  }
  queries.forEach((q) => q?.addEventListener?.("change", onChange))

  /* On the canvas: typing into a field pauses every island, so the text being edited is the text shown. */
  if (opts.inCanvas) {
    if (canvasCount++ === 0) {
      document.addEventListener("focusin", onFocus)
      document.addEventListener("focusout", onFocus)
    }
  }

  return () => {
    alive = false
    queries.forEach((q) => q?.removeEventListener?.("change", onChange))
    if (opts.inCanvas && --canvasCount === 0) {
      document.removeEventListener("focusin", onFocus)
      document.removeEventListener("focusout", onFocus)
      editing = false
    }
    stopAll()
  }
}

/* ── shared helpers for islands ───────────────────────────────────────── */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 0 as the island's top enters the bottom of the view, 1 as its bottom leaves the top. */
export function progressThrough(rect: DOMRect, vp: { top: number; height: number }): number {
  return clamp01((vp.top + vp.height - rect.top) / (vp.height + rect.height))
}

/** For a tall island with a sticky stage: 0 when its top reaches the view's top, 1 when its bottom reaches the view's bottom. */
export function progressPinned(rect: DOMRect, vp: { top: number; height: number }, stageHeight: number): number {
  const run = rect.height - stageHeight
  if (run <= 1) return clamp01((vp.top - rect.top) / Math.max(1, rect.height))
  return clamp01((vp.top - rect.top) / run)
}

/**
 * A colour as [r, g, b] in 0..1, whatever CSS colour syntax it was written
 * in, by painting one pixel. Null when it is not a colour.
 */
let px: CanvasRenderingContext2D | null = null
export function rgbOf(css: string): [number, number, number] | null {
  const v = css.trim()
  if (!v) return null
  try {
    px ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    if (!px) return null
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("color", v)) return null
    px.clearRect(0, 0, 1, 1)
    px.fillStyle = v
    px.fillRect(0, 0, 1, 1)
    const d = px.getImageData(0, 0, 1, 1).data
    return [d[0] / 255, d[1] / 255, d[2] / 255]
  } catch {
    return null
  }
}

const mixRgb = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * A palette param as four colours: "scheme" from the section's own scheme
 * variables (--s-bg, --s-accent, --s-heading / --s-btn-bg, --s-text, then
 * the theme's), "accent" around its accent, "mono" from its background and
 * text, or the hex colours given (repeated to four).
 */
export function resolvePalette(el: HTMLElement, palette: string[]): [number, number, number][] {
  const cs = getComputedStyle(el)
  const read = (...names: string[]) => {
    for (const nm of names) {
      const c = rgbOf(cs.getPropertyValue(nm))
      if (c) return c
    }
    return null
  }
  const bg = read("--s-bg", "--theme-color-background", "--t-color-background") ?? rgbOf(cs.backgroundColor) ?? [0.07, 0.07, 0.09]
  const text = read("--s-text", "--s-heading", "--theme-color-text", "--t-color-text") ?? rgbOf(cs.color) ?? [0.95, 0.95, 0.95]
  const accent = read("--s-accent", "--theme-color-accent", "--t-color-accent", "--s-btn-bg") ?? [0.35, 0.4, 0.95]
  const second = read("--s-btn-bg", "--s-heading", "--t-color-secondary") ?? mixRgb(accent, text, 0.35)
  const kw = palette[0]
  if (kw === "scheme") return [bg, accent, second, mixRgb(bg, text, 0.12)]
  if (kw === "accent") return [mixRgb(accent, [0, 0, 0], 0.55), accent, mixRgb(accent, [1, 1, 1], 0.35), mixRgb(accent, bg, 0.5)]
  if (kw === "mono") return [bg, mixRgb(bg, text, 0.18), mixRgb(bg, text, 0.06), mixRgb(bg, text, 0.3)]
  const hexes = palette.map((h) => rgbOf(h)).filter((c): c is [number, number, number] => !!c)
  if (hexes.length === 0) return [bg, accent, second, mixRgb(bg, text, 0.12)]
  while (hexes.length < 4) hexes.push(hexes[hexes.length % Math.max(1, hexes.length)] ?? bg)
  return hexes.slice(0, 4)
}

export const cssRgb = (c: [number, number, number]) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`

/** Makes `el` a positioning context if it is not one, and undoes it. */
export function positioned(el: HTMLElement): () => void {
  if (getComputedStyle(el).position !== "static") return () => {}
  el.style.position = "relative"
  return () => el.style.removeProperty("position")
}

/** For tests: how many islands are running and whether the loop is. */
export function motionRuntimeState(): { running: number; looping: boolean; glInUse: number; editing: boolean } {
  return { running: running.size, looping: raf !== 0, glInUse, editing }
}

/**
 * ===========================================================================
 *  MOTION ISLANDS: THE PAGE'S OWN INTERACTIVE EFFECTS, CONFIGURED BY MARKUP
 * ===========================================================================
 * Round P (P3). A section's own `<script>` runs in a sandbox against a copy
 * of its markup (./sandbox/protocol.ts): it cannot measure the page, read the
 * scroll or the pointer, or draw with WebGL. That is the right place for code
 * an AI or a creator wrote. But the moves high-end sites are made of (a
 * product turning in 3D as you scroll, a film scrubbed by the scrollbar, a
 * gallery pinned and run sideways, a shader background in the brand's
 * colours, a marquee that answers the scroll's speed) need exactly that.
 *
 * So Storelib ships them itself. A motion island is first-party, reviewed
 * code (components/website-builder/motion-islands) that a section ASKS FOR
 * with an attribute, and configures with `data-motion-*` params:
 *
 *   <section data-storelib-motion="3d-object" data-motion-shape="card"
 *            data-motion-rotate="both" data-motion-intensity="50">
 *     <img src="{{ settings.image | asset }}" alt="..." data-motion-fallback>
 *   </section>
 *
 * Nothing the markup says is ever run. A param is a number (clamped into a
 * safe range), one of a fixed list of words, a yes or no, a short plain text
 * label (written as text, never markup), or a palette of hex colours. No
 * param is a URL: a picture an island uses is an `<img>` the section already
 * draws. Unknown islands and unknown params are refused here and reported by
 * the agent's render check (lib/ai-builder/render-check.ts).
 *
 * THE STILL STATE IS THE PAGE. Before the runtime loads, without JavaScript,
 * for a visitor who asked for less motion, on a slow-refresh screen, in a
 * section whose O5 motion setting is "off" (data-motion="off"), and where
 * WebGL is missing or the device is low-power, every island is its own
 * markup, readable and complete. Islands only enhance.
 *
 * Pure: no DOM, no React. Imported by the runtime, the render check, the
 * knowledge library and the prompt.
 */

/* ── the contract ─────────────────────────────────────────────────────── */

export { MOTION_ATTR, MOTION_PARAM_PREFIX, MOTION_NODE_ATTR, MOTION_READY_ATTR, MOTION_PROGRESS_VAR, motionBaseCss } from "./motion-islands-base"
import { MOTION_ATTR, MOTION_PARAM_PREFIX } from "./motion-islands-base"

export const MOTION_ISLAND_KINDS = [
  "scroll-scrub",
  "pin-horizontal",
  "parallax-depth",
  "3d-object",
  "3d-tilt",
  "webgl-gradient",
  "marquee",
  "text-scramble",
  "reveal-stagger",
  "smooth-scroll",
  "image-trail",
  "cursor-follow",
] as const
export type MotionIslandKind = (typeof MOTION_ISLAND_KINDS)[number]

export function isMotionIslandKind(v: unknown): v is MotionIslandKind {
  return typeof v === "string" && (MOTION_ISLAND_KINDS as readonly string[]).includes(v)
}

export type ParamSpec =
  | { kind: "number"; label: string; min: number; max: number; step: number; default: number; unit?: string; info?: string }
  | { kind: "enum"; label: string; options: readonly string[]; labels: readonly string[]; default: string; info?: string }
  | { kind: "bool"; label: string; default: boolean; info?: string }
  /** Plain words, written as text: at most `max` characters, no markup characters. */
  | { kind: "text"; label: string; max: number; default: string; info?: string }
  /** "scheme" (the section's colours), "accent", "mono", or up to five hex colours separated by commas. */
  | { kind: "palette"; label: string; default: string; info?: string }

export type ParamValue = number | string | boolean | string[]

export interface MotionIslandSpec {
  kind: MotionIslandKind
  name: string
  /** What it looks like, in a line. */
  feel: string
  /** When to reach for it. */
  use: string
  /** When not to. */
  avoid: string
  /** The markup it reads, in a line, for the prompt and the knowledge entry. */
  markup: string
  params: Record<string, ParamSpec>
  /** A scroll-linked showcase (pinned, scrubbed or a 3D centrepiece): counted against the tier's per-page budget. */
  showcase: boolean
  /** Draws with WebGL: static on low-power devices and where WebGL is missing; at most MAX_GL_ISLANDS per page. */
  webgl: boolean
  /** Loads three.js (by dynamic import, only on a page that has one). */
  three: boolean
  /** Acts on the whole page, not its element. */
  pageLevel: boolean
  mobile: string
  reducedMotion: string
  lowPower: string
}

/** WebGL contexts one page may run at once (3d-object and webgl-gradient). Further ones stay still. */
export const MAX_GL_ISLANDS = 2
/** Showcase islands one page may hold before the render check warns (the tier's own budget is in lib/storelib-ai/motion). */
export const MAX_SHOWCASE_ISLANDS = 2

const n = (label: string, min: number, max: number, step: number, def: number, unit?: string, info?: string): ParamSpec => ({ kind: "number", label, min, max, step, default: def, ...(unit ? { unit } : {}), ...(info ? { info } : {}) })
const e = (label: string, options: readonly string[], labels: readonly string[], def: string, info?: string): ParamSpec => ({ kind: "enum", label, options, labels, default: def, ...(info ? { info } : {}) })
const b = (label: string, def: boolean, info?: string): ParamSpec => ({ kind: "bool", label, default: def, ...(info ? { info } : {}) })

export const MOTION_ISLANDS: Record<MotionIslandKind, MotionIslandSpec> = {
  "scroll-scrub": {
    kind: "scroll-scrub",
    name: "Scroll scrubbed sequence",
    feel: "a product turns, a film plays, a scene changes frame by frame as the visitor scrolls, the stage pinned while it runs",
    use: "one cinematic centrepiece: a product turning, a process filmed, a before into after; the creator has a short video or 8 to 60 numbered photos",
    avoid: "a site with no footage or sequence; more than one per page; quiet tier sites",
    markup: "the island is tall; inside it one [data-motion-stage] holding either <video data-motion-video muted playsinline preload=\"auto\"> or several <img data-motion-frame> in order; captions may read var(--motion-progress)",
    params: {
      length: n("Scroll length", 1, 6, 0.5, 3, "screens", "How many screen heights the sequence runs over"),
      still: e("Still frame", ["first", "middle", "last"], ["First", "Middle", "Last"], "first", "Shown when motion is off"),
      mobile: e("On phones", ["scrub", "still"], ["Scrub, shorter", "Still frame"], "scrub"),
    },
    showcase: true, webgl: false, three: false, pageLevel: false,
    mobile: "scrubs over 70% of the length, or shows the still frame when set to",
    reducedMotion: "the still frame, in normal flow, no pinning",
    lowPower: "scrubs images by swapping which one is shown; a video seeks only when the last seek finished",
  },
  "pin-horizontal": {
    kind: "pin-horizontal",
    name: "Pinned sideways run",
    feel: "the section pins and its row of panels slides sideways as the visitor scrolls down, then lets go",
    use: "a body of visual work, a collection, chapters of a story; four to eight panels",
    avoid: "text-heavy content that must be read carefully; more than one per page",
    markup: "inside the island one [data-motion-stage] holding one [data-motion-track] whose children are the panels (flex row)",
    params: {
      speed: n("Scroll distance", 0.5, 2, 0.1, 1, "x", "Longer is slower"),
      direction: e("Direction", ["left", "right"], ["Right to left", "Left to right"], "left"),
      mobile: e("On phones", ["swipe", "stack"], ["Swipe", "Stack"], "swipe"),
    },
    showcase: true, webgl: false, three: false, pageLevel: false,
    mobile: "a native sideways swipe with snap points, or panels stacked, no pinning",
    reducedMotion: "a native sideways swipe with snap points",
    lowPower: "transform only on one track",
  },
  "parallax-depth": {
    kind: "parallax-depth",
    name: "Layered depth",
    feel: "layered pictures and type drift at different speeds with the scroll and the pointer, giving a scene depth",
    use: "a hero or band built from layers: a cut-out product over a backdrop, type behind a photo",
    avoid: "a single flat photo (use the O5 drift); text the visitor must read while it moves",
    markup: "children marked data-motion-depth=\"-1..1\" (0 still, positive moves against the scroll, negative with it)",
    params: {
      intensity: n("Strength", 0, 100, 5, 40, "%"),
      pointer: b("Follow the pointer", true, "On a mouse only"),
      axis: e("Movement", ["vertical", "horizontal", "both"], ["Up and down", "Sideways", "Both"], "vertical"),
    },
    showcase: false, webgl: false, three: false, pageLevel: false,
    mobile: "half the travel, no pointer",
    reducedMotion: "layers still in place",
    lowPower: "transform only, measured once per frame",
  },
  "3d-object": {
    kind: "3d-object",
    name: "3D object",
    feel: "a product photo on a real 3D card, or a lit 3D shape, turning with the scroll and leaning toward the pointer",
    use: "a product launch, an app, a drink, a watch: the hero's one object; a brand mark as a lit shape",
    avoid: "more than one per page; a page with no object worth looking at; quiet tier sites",
    markup: "an <img data-motion-fallback> inside is the card's face and the still state; without one a generated shape is drawn in the palette",
    params: {
      shape: e("Shape", ["card", "sphere", "torus", "knot", "box", "blob", "coin"], ["Card", "Sphere", "Ring", "Knot", "Box", "Blob", "Coin"], "card"),
      rotate: e("Turns with", ["scroll", "pointer", "both", "auto"], ["Scroll", "Pointer", "Scroll and pointer", "On its own"], "both"),
      speed: n("Speed", 0, 2, 0.1, 0.6, "x"),
      intensity: n("Turn", 0, 100, 5, 50, "%"),
      finish: e("Finish", ["matte", "satin", "gloss", "metal"], ["Matte", "Satin", "Gloss", "Metal"], "satin"),
      light: e("Light", ["studio", "soft", "dramatic"], ["Studio", "Soft", "Dramatic"], "studio"),
      color: { kind: "palette", label: "Colour", default: "accent", info: "accent, scheme, mono or #hex" },
      float: b("Float", true),
    },
    showcase: true, webgl: true, three: true, pageLevel: false,
    mobile: "lower resolution, turns with the scroll only",
    reducedMotion: "the picture itself, still (or the island's own still markup)",
    lowPower: "the picture itself, still; three.js is never loaded",
  },
  "3d-tilt": {
    kind: "3d-tilt",
    name: "3D tilt",
    feel: "a card leans a few degrees toward the pointer with a soft glare, in CSS 3D",
    use: "a product card, a cover, a ticket, a membership card",
    avoid: "every card on the page; touch-first layouts",
    markup: "the island is the card; a [data-motion-glare] child is optional (the runtime adds one when glare is on)",
    params: {
      intensity: n("Tilt", 2, 20, 1, 8, "deg"),
      glare: b("Glare", true),
      scale: n("Lift", 100, 110, 1, 102, "%"),
      perspective: n("Depth", 400, 2000, 100, 900, "px"),
    },
    showcase: false, webgl: false, three: false, pageLevel: false,
    mobile: "flat (no hover on touch)",
    reducedMotion: "flat",
    lowPower: "transform only",
  },
  "webgl-gradient": {
    kind: "webgl-gradient",
    name: "Living gradient",
    feel: "a slow, grainy shader gradient in the site's own colours flowing behind the content",
    use: "a software or music hero, a launch band, a dark section that needs atmosphere",
    avoid: "behind long text; more than one per page; with a photo hero",
    markup: "the island is a positioned section; the canvas goes behind its children",
    params: {
      palette: { kind: "palette", label: "Colours", default: "scheme", info: "scheme, accent, mono or up to five #hex" },
      speed: n("Speed", 0, 2, 0.1, 0.4, "x"),
      intensity: n("Flow", 0, 100, 5, 60, "%"),
      grain: n("Grain", 0, 100, 5, 12, "%"),
    },
    showcase: false, webgl: true, three: false, pageLevel: false,
    mobile: "half resolution, slower",
    reducedMotion: "one still frame of the gradient as CSS",
    lowPower: "a CSS gradient in the same colours",
  },
  marquee: {
    kind: "marquee",
    name: "Velocity marquee",
    feel: "a running line of type or logos that speeds up with the scroll and turns with its direction",
    use: "real words: dates, a release, client names, a manifesto line; giant display type between sections",
    avoid: "made up claims; more than one per page",
    markup: "one [data-motion-track] holding the items (the runtime adds hidden copies so it loops)",
    params: {
      speed: n("Speed", 10, 400, 10, 80, "px/s"),
      direction: e("Direction", ["left", "right"], ["Right to left", "Left to right"], "left"),
      reactive: n("Scroll boost", 0, 100, 5, 50, "%"),
      flip: b("Turn with the scroll", true),
      pause: b("Pause on hover", true),
    },
    showcase: false, webgl: false, three: false, pageLevel: false,
    mobile: "the same, no hover pause",
    reducedMotion: "the line, still and wrapped; the copies are never added",
    lowPower: "one transform per frame",
  },
  "text-scramble": {
    kind: "text-scramble",
    name: "Text scramble",
    feel: "a heading or label decodes from random characters into its words",
    use: "a technical, gaming, software or music brand's labels and one headline",
    avoid: "body text; luxury, wellness or warm brands",
    markup: "the island's text (its own text nodes) is scrambled; screen readers read the real words",
    params: {
      trigger: e("Plays", ["view", "hover", "both", "load"], ["When seen", "On hover", "Both", "On load"], "view"),
      duration: n("Duration", 300, 3000, 100, 900, "ms"),
      chars: e("Characters", ["letters", "digits", "symbols", "binary"], ["Letters", "Digits", "Symbols", "Binary"], "letters"),
      once: b("Only once", true),
    },
    showcase: false, webgl: false, three: false, pageLevel: false,
    mobile: "the same",
    reducedMotion: "the words, still",
    lowPower: "the same; text only",
  },
  "reveal-stagger": {
    kind: "reveal-stagger",
    name: "Staggered reveal",
    feel: "items arrive one after another as the section comes into view",
    use: "lists, grids, steps, a gallery: content that arrives in order",
    avoid: "hero headlines already in view (they stay as they are), every section on the page",
    markup: "the island's children, or its [data-motion-item] elements, are revealed in order",
    params: {
      effect: e("Effect", ["rise", "fade", "scale", "slide-left", "slide-right"], ["Rise", "Fade", "Scale", "From the right", "From the left"], "rise"),
      stagger: n("Between items", 20, 200, 10, 65, "ms"),
      distance: n("Travel", 0, 80, 4, 24, "px"),
      duration: n("Duration", 200, 1500, 50, 650, "ms"),
      once: b("Only once", true),
    },
    showcase: false, webgl: false, three: false, pageLevel: false,
    mobile: "shorter travel",
    reducedMotion: "visible, still",
    lowPower: "transform and opacity, one observer",
  },
  "smooth-scroll": {
    kind: "smooth-scroll",
    name: "Smooth scroll feel",
    feel: "the page's scroll-linked islands glide to where the scroll is, and anchor links travel instead of jumping",
    use: "an expressive site with scroll-linked islands; put it once, on the first section",
    avoid: "quiet sites; it never takes over the wheel, the page scrolls natively",
    markup: "any element on the page; one per page",
    params: {
      damping: n("Glide", 0.05, 0.5, 0.01, 0.12, "", "Lower glides longer"),
      anchors: b("Smooth anchor links", true),
    },
    showcase: false, webgl: false, three: false, pageLevel: true,
    mobile: "native touch scrolling; only anchor links glide",
    reducedMotion: "off",
    lowPower: "anchor links only",
  },
  "image-trail": {
    kind: "image-trail",
    name: "Image trail",
    feel: "pictures appear under the pointer as it moves across the section and fade behind it",
    use: "a playful brand, a portfolio, a menu or collection with real photos (four to twelve)",
    avoid: "touch-first pages (it shows the pictures as a row there); more than one per page",
    markup: "the island holds the pictures as <img> in a [data-motion-images] list",
    params: {
      threshold: n("Spacing", 20, 300, 10, 80, "px"),
      lifetime: n("Fade after", 200, 2500, 100, 900, "ms"),
      max: n("Pictures at once", 2, 16, 1, 7),
      size: n("Picture size", 60, 400, 10, 180, "px"),
      rotate: n("Tilt", 0, 30, 1, 8, "deg"),
    },
    showcase: false, webgl: false, three: false, pageLevel: false,
    mobile: "the pictures as a still row",
    reducedMotion: "the pictures as a still row",
    lowPower: "the same; transform and opacity",
  },
  "cursor-follow": {
    kind: "cursor-follow",
    name: "Cursor label",
    feel: "a round label (View, Play, Drag) follows the pointer over the section with a soft lag",
    use: "creative portfolios and galleries, over images",
    avoid: "replacing the system cursor (it never does), forms, touch pages",
    markup: "a [data-motion-follower] child is optional; the runtime draws a round label otherwise",
    params: {
      label: { kind: "text", label: "Label", max: 24, default: "View" },
      size: n("Size", 8, 160, 4, 72, "px"),
      lag: n("Lag", 0, 0.95, 0.05, 0.8, ""),
      blend: e("Blend", ["normal", "difference"], ["Normal", "Difference"], "normal"),
    },
    showcase: false, webgl: false, three: false, pageLevel: false,
    mobile: "off",
    reducedMotion: "off",
    lowPower: "one transform per frame",
  },
}

/* ── reading params ───────────────────────────────────────────────────── */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/** Markup characters and controls: a text param is plain words. */
const NOT_PLAIN = /[<>"'`\\{}\u0000-\u001f\u007f]/g

/** A palette param: a keyword, or up to five hex colours. Anything else is the default. */
export function parsePalette(raw: string | null | undefined, fallback: string): string[] {
  const v = (raw ?? "").trim().toLowerCase()
  if (v === "scheme" || v === "accent" || v === "mono") return [v]
  const hexes = v.split(/[\s,]+/).filter(Boolean)
  if (hexes.length > 0 && hexes.length <= 5 && hexes.every((h) => HEX.test(h))) return hexes.map(expandHex)
  return [fallback]
}

function expandHex(h: string): string {
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`.toLowerCase() : h.toLowerCase()
}

/** One param, read from its attribute value (null when absent) and made safe. */
export function parseParam(spec: ParamSpec, raw: string | null | undefined): ParamValue {
  const s = raw == null ? null : String(raw).trim()
  switch (spec.kind) {
    case "number": {
      const v = s === null || s === "" ? NaN : Number(s)
      if (!Number.isFinite(v)) return spec.default
      const clamped = Math.min(spec.max, Math.max(spec.min, v))
      /* To the step, without float dust. */
      const stepped = Math.round((clamped - spec.min) / spec.step) * spec.step + spec.min
      return Number(Math.min(spec.max, stepped).toFixed(4))
    }
    case "enum":
      return s !== null && spec.options.includes(s.toLowerCase()) ? s.toLowerCase() : spec.default
    case "bool":
      if (s === null) return spec.default
      if (s === "" || /^(true|yes|on|1)$/i.test(s)) return true
      if (/^(false|no|off|0)$/i.test(s)) return false
      return spec.default
    case "text":
      return s === null ? spec.default : s.replace(NOT_PLAIN, "").slice(0, spec.max)
    case "palette":
      return parsePalette(s, spec.default)
  }
}

/** Kebab attribute name of a param: `data-motion-<name>`. */
export function paramAttr(name: string): string {
  return `${MOTION_PARAM_PREFIX}${name}`
}

/**
 * Every param of an island, from a getter over its attributes (an Element's
 * getAttribute, or a record in a test). Unknown and missing params never
 * throw: each is its default.
 */
export function parseMotionParams(kind: MotionIslandKind, get: (attr: string) => string | null | undefined): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}
  for (const [name, spec] of Object.entries(MOTION_ISLANDS[kind].params)) out[name] = parseParam(spec, get(paramAttr(name)))
  return out
}

/** The island an attribute value names, or null. Case and spaces forgiven, nothing else. */
export function parseMotionKind(raw: string | null | undefined): MotionIslandKind | null {
  const v = (raw ?? "").trim().toLowerCase()
  return isMotionIslandKind(v) ? v : null
}

/* ── where it runs, and how much of it ────────────────────────────────── */

export interface MotionEnvironment {
  /** prefers-reduced-motion: reduce, or update: slow. */
  reducedMotion: boolean
  /** Save-Data, ≤ 2 GB memory, ≤ 2 cores, or WebGL backed by software. */
  lowPower: boolean
  /** A phone-width screen or a coarse pointer. */
  mobile: boolean
  /** A pointer that hovers precisely (a mouse or trackpad). */
  finePointer: boolean
  /** A hardware WebGL context can be made. */
  webgl: boolean
  /** In the builder's canvas. */
  inCanvas: boolean
}

/**
 * How an island runs here: "full", "simple" (the mobile version) or
 * "static" (its own markup, still). The island element's O5 switch,
 * data-motion="off" on it or an ancestor, is passed as `off`.
 */
export type MotionMode = "full" | "simple" | "static"

export function motionMode(kind: MotionIslandKind, env: MotionEnvironment, opts: { off?: boolean; glSlotsLeft?: number; params?: Record<string, ParamValue> } = {}): MotionMode {
  const spec = MOTION_ISLANDS[kind]
  if (opts.off || env.reducedMotion) return "static"
  if (spec.webgl && (!env.webgl || env.lowPower || (opts.glSlotsLeft ?? 1) <= 0)) return "static"
  if (kind === "smooth-scroll") return env.inCanvas ? "static" : env.mobile || env.lowPower ? "simple" : "full"
  const hoverOnly = kind === "3d-tilt" || kind === "cursor-follow" || kind === "image-trail"
  if (hoverOnly && !env.finePointer) return "static"
  if (env.mobile) {
    if (kind === "pin-horizontal" || (kind === "scroll-scrub" && opts.params?.mobile === "still")) return "static"
    return "simple"
  }
  return "full"
}

/* ── reading markup (render check, prompt tooling) ────────────────────── */

export interface MotionUse {
  kind: string
  known: boolean
  params: { name: string; value: string; known: boolean }[]
  /** Index in the markup. */
  index: number
}

/** Every island a drawn section's markup asks for, with the params on the same tag. */
export function motionIslandsIn(html: string): MotionUse[] {
  const out: MotionUse[] = []
  for (const m of html.matchAll(/<[a-z][a-z0-9-]*\b([^>]*?)\sdata-storelib-motion\s*=\s*(["']?)([^"'\s>]*)\2([^>]*)>/gi)) {
    const kind = m[3].trim().toLowerCase()
    const attrs = `${m[1]} ${m[4]}`
    const known = isMotionIslandKind(kind)
    const params = [...attrs.matchAll(/\sdata-motion-([a-z0-9-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)].map((p) => {
      const name = p[1].toLowerCase()
      return { name, value: p[2] ?? p[3] ?? p[4] ?? "", known: known && name in MOTION_ISLANDS[kind as MotionIslandKind].params }
    })
    out.push({ kind, known, params, index: m.index ?? 0 })
  }
  return out
}

export interface MotionFinding {
  severity: "error" | "warning"
  message: string
}

/**
 * What is wrong with the islands of one drawn page (all its sections'
 * markup): an unknown island is an error (nothing would run), an unknown
 * param or a value outside its range is a warning (it falls back), and too
 * many showcases or WebGL islands on one page are warnings.
 */
export function motionFindings(pageHtml: string): MotionFinding[] {
  const out: MotionFinding[] = []
  const uses = motionIslandsIn(pageHtml)
  for (const u of uses) {
    if (!u.known) {
      out.push({ severity: "error", message: `data-storelib-motion="${u.kind}" is not a motion island. Use one of: ${MOTION_ISLAND_KINDS.join(", ")}.` })
      continue
    }
    const spec = MOTION_ISLANDS[u.kind as MotionIslandKind]
    for (const p of u.params) {
      if (/^(?:video|frame|stage|track|depth|item|images|fallback|follower|glare|ready|active|progress)$/.test(p.name)) continue
      if (!p.known) {
        out.push({ severity: "warning", message: `data-motion-${p.name} is not a param of the ${u.kind} island (it has: ${Object.keys(spec.params).join(", ")}).` })
        continue
      }
      const ps = spec.params[p.name]
      if (ps.kind === "number") {
        const v = Number(p.value)
        if (!Number.isFinite(v) || v < ps.min || v > ps.max) out.push({ severity: "warning", message: `data-motion-${p.name}="${p.value}" on ${u.kind} is outside ${ps.min} to ${ps.max}; ${ps.default} is used.` })
      } else if (ps.kind === "enum" && !ps.options.includes(p.value.toLowerCase())) {
        out.push({ severity: "warning", message: `data-motion-${p.name}="${p.value}" on ${u.kind} is not one of ${ps.options.join(", ")}; "${ps.default}" is used.` })
      } else if (ps.kind === "palette" && parsePalette(p.value, "__bad__")[0] === "__bad__") {
        out.push({ severity: "warning", message: `data-motion-${p.name}="${p.value}" on ${u.kind} is not scheme, accent, mono or up to five #hex colours.` })
      }
    }
  }
  const known = uses.filter((u) => u.known).map((u) => MOTION_ISLANDS[u.kind as MotionIslandKind])
  const showcases = known.filter((s) => s.showcase).length
  if (showcases > MAX_SHOWCASE_ISLANDS) out.push({ severity: "warning", message: `This page has ${showcases} showcase islands (scroll-scrub, pin-horizontal, 3d-object). Keep one, two at most: one strong scroll chapter beats several weak ones.` })
  const gl = known.filter((s) => s.webgl).length
  if (gl > MAX_GL_ISLANDS) out.push({ severity: "warning", message: `This page has ${gl} WebGL islands; only ${MAX_GL_ISLANDS} run, the rest stay still.` })
  if (known.filter((s) => s.pageLevel).length > 1) out.push({ severity: "warning", message: "smooth-scroll is on this page more than once. Put it on one element." })
  return out
}

/* ── the editor's controls ────────────────────────────────────────────── */

export interface MotionSchemaSetting {
  type: "range" | "select" | "checkbox" | "text"
  id: string
  label: string
  default: number | string | boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  info?: string
  options?: { value: string; label: string }[]
}

/** The schema setting id a param is edited with. */
export function settingIdOf(name: string): string {
  return `motion_${name.replace(/-/g, "_")}`
}

/**
 * An island's params as schema settings, ready to paste into a section's
 * <schema> settings, so the creator edits them in the existing sidebar.
 * A palette is a text setting ("scheme", "accent", "mono" or #hex list).
 */
export function motionSchemaSettings(kind: MotionIslandKind): MotionSchemaSetting[] {
  return Object.entries(MOTION_ISLANDS[kind].params).map(([name, p]) => {
    const id = settingIdOf(name)
    const info = p.info ? { info: p.info } : {}
    if (p.kind === "number") return { type: "range", id, label: p.label, min: p.min, max: p.max, step: p.step, ...(p.unit ? { unit: p.unit } : {}), default: p.default, ...info }
    if (p.kind === "enum") return { type: "select", id, label: p.label, options: p.options.map((value, i) => ({ value, label: p.labels[i] ?? value })), default: p.default, ...info }
    if (p.kind === "bool") return { type: "checkbox", id, label: p.label, default: p.default, ...info }
    return { type: "text", id, label: p.label, default: p.default, ...info }
  })
}

/** The attributes an island's root prints, each from its setting: `data-storelib-motion="..." data-motion-x="{{ settings.motion_x }}" ...`. */
export function motionAttributes(kind: MotionIslandKind): string {
  const params = Object.keys(MOTION_ISLANDS[kind].params).map((name) => `${paramAttr(name)}="{{ settings.${settingIdOf(name)} }}"`)
  return [`${MOTION_ATTR}="${kind}"`, ...params].join(" ")
}

/* ── what the agent is told ───────────────────────────────────────────── */

function paramLine(name: string, p: ParamSpec): string {
  if (p.kind === "number") return `${name} ${p.min}-${p.max}${p.unit ? ` ${p.unit}` : ""} (${p.default})`
  if (p.kind === "enum") return `${name} ${p.options.join("|")} (${p.default})`
  if (p.kind === "bool") return `${name} true|false (${p.default})`
  if (p.kind === "text") return `${name} text (${p.default})`
  return `${name} scheme|accent|mono|#hex,#hex (${p.default})`
}

/**
 * The prompt block (lib/ai-builder/agent/prompts.ts): what the islands are,
 * when to use each, the markup each reads and its params.
 */
export function motionIslandsForPrompt(): string {
  const lines = MOTION_ISLAND_KINDS.map((k) => {
    const s = MOTION_ISLANDS[k]
    return `- ${k}: ${s.feel}. Use: ${s.use}. Markup: ${s.markup}. Params: ${Object.entries(s.params).map(([nm, p]) => paramLine(nm, p)).join(", ")}.`
  })
  return `MOTION ISLANDS (Storelib's own interactive effects; you configure them, you never script them)
Your section's <script> runs in a sandbox and cannot read the scroll or pointer or draw WebGL. For 3D, scroll scrubbing, pinned sideways runs, shader backgrounds, a scroll-reactive marquee, an image trail or a cursor label, mark an element data-storelib-motion="<island>" and set its params as data-motion-<param>="{{ settings.motion_<param> }}" from schema settings so the creator edits them (search_knowledge "motion islands" for the settings JSON and examples ai_object_hero, ai_scrub_story, ai_pin_gallery, ai_gradient_marquee, ai_image_trail).
- The island's own markup is its still state: complete and readable without JavaScript, with reduced motion, on low-power phones and without WebGL. Write real content inside it (the photo, the frames, the panels, the words); never an empty div.
- A picture an island uses is an <img> you draw from an image_picker (| asset, with alt). No param is a URL.
- Budget: one showcase per page (scroll-scrub, pin-horizontal or 3d-object; two on an expressive site), at most two WebGL islands (3d-object, webgl-gradient), smooth-scroll once on expressive sites only. Pick by the business: 3D objects for products and tech, scrub for a product or process on film, pinned runs for collections and work, gradients for software and music, trails and cursor labels for playful brands and portfolios.
${lines.join("\n")}`
}

/**
 * ===========================================================================
 *  A LINK TO A SECTION, AND HOW A SECTION ARRIVES
 * ===========================================================================
 * Two things a page does with its own sections, kept in one pure file so the
 * link picker, the editor's canvas, the published page and the tests all ask
 * the same questions and get the same answers.
 *
 * WHERE A SECTION LINK POINTS. Every section's box carries
 * `data-anchor="section-<instance id>"` (and, on the live page, that as its
 * id), so a link picked in the builder is stored as `#section-<id>`: the
 * instance id never changes, so renaming the heading or moving the section
 * does not break the link. Links people typed before this existed keep
 * working: `#pricing` and `/#pricing` find the section whose id is
 * `pricing`, or whose heading, name or type reads "pricing", in that order.
 *
 * HOW A SECTION ARRIVES. The theme says (Theme settings › Animations), a
 * section may say otherwise with its own `animation` setting, and some
 * sections never move at all: the header, the footer, the first section of
 * the page, and a section that brings animation of its own.
 *
 * Nothing here touches the DOM; lib/website-builder/section-motion.ts does.
 * tests/anchors-motion.test.ts runs this file.
 */

// ── Anchors ─────────────────────────────────────────────────────────────────

export const SECTION_ANCHOR_PREFIX = "section-"

/** The anchor a section's box carries, and what a picked link stores after `#`. */
export function sectionAnchor(sectionId: string): string {
  return `${SECTION_ANCHOR_PREFIX}${sectionId}`
}

/** What a section looks like to the questions below. */
export interface SectionLike {
  id: string
  type: string
  name?: string | null
  settings?: Record<string, unknown> | null
  blocks?: { type: string; settings?: Record<string, unknown> | null; blocks?: unknown[] }[] | null
  hidden?: boolean
}

/** The facts an anchor is matched against, from saved settings or from the page itself. */
export interface AnchorCandidate {
  id: string
  type: string
  name?: string | null
  heading?: string | null
  /** An anchor the section names itself, from an `anchor` setting. */
  anchor?: string | null
}

/** Lower case, accents dropped, anything that is not a letter or a digit one dash. */
export function anchorSlug(text: string): string {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " }

/** Rich text to words: tags gone, the common entities read, spaces collapsed. */
export function plainText(html: unknown): string {
  if (typeof html !== "string") return ""
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, k: string) => ENTITIES[k] ?? " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** The settings a section's visible title is kept in, most specific first. */
const HEADING_KEYS = ["heading", "title", "headline", "section_title", "section_heading"] as const

/**
 * The words at the top of a section, as a visitor reads them: its heading
 * setting, or the first heading block's. Empty when it has neither.
 */
export function sectionHeading(section: Pick<SectionLike, "settings" | "blocks">): string {
  const s = section.settings ?? {}
  for (const key of HEADING_KEYS) {
    const text = plainText(s[key])
    if (text) return text
  }
  for (const block of section.blocks ?? []) {
    if (!/heading|title/i.test(block.type)) continue
    const b = block.settings ?? {}
    for (const key of [...HEADING_KEYS, "text"]) {
      const text = plainText(b[key])
      if (text) return text
    }
  }
  return ""
}

/** Never a sentence in a list row. */
const LABEL_MAX = 48

function clip(text: string): string {
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1).trimEnd()}…` : text
}

/**
 * What a section is called in a link field: its heading when it has one
 * ("Pricing", "Questions"), else its name ("FAQ"), never an id.
 */
export function sectionLinkLabel(section: SectionLike, displayName?: string): string {
  const heading = sectionHeading(section)
  if (heading) return clip(heading)
  const name = (displayName ?? section.name ?? "").trim()
  if (name) return clip(name)
  return clip(section.type.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()))
}

/** Chrome is everywhere, so it is nowhere to scroll to. */
export function isChromeType(type: string): boolean {
  return type === "header" || type === "footer"
}

export interface SectionLink {
  id: string
  label: string
  /** `section-<id>`, without the `#`. */
  anchor: string
}

/** The sections of a page a link can point at, in page order. */
export function linkableSections(
  sections: readonly SectionLike[],
  nameOf?: (section: SectionLike) => string,
): SectionLink[] {
  return sections
    .filter((s) => !s.hidden && !isChromeType(s.type))
    .map((s) => ({ id: s.id, label: sectionLinkLabel(s, nameOf?.(s)), anchor: sectionAnchor(s.id) }))
}

/** A section's own anchor setting, if it declares one. */
export function ownAnchor(section: Pick<SectionLike, "settings">): string {
  const v = section.settings?.anchor
  return typeof v === "string" ? anchorSlug(v) : ""
}

/** Saved sections as anchor candidates. */
export function candidatesOf(sections: readonly SectionLike[]): AnchorCandidate[] {
  return sections
    .filter((s) => !isChromeType(s.type))
    .map((s) => ({ id: s.id, type: s.type, name: s.name, heading: sectionHeading(s), anchor: ownAnchor(s) }))
}

function decodeHash(hash: string): string {
  const raw = hash.replace(/^#/, "")
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

/**
 * Which section a `#hash` means, or null. In this order, first match wins:
 *
 *   1. `section-<id>`, what the picker stores
 *   2. the instance id itself (`/#pricing` for a section saved as `pricing`)
 *   3. an anchor the section names in its own `anchor` setting
 *   4. its heading, as a slug (`#ghostwriting` for "Ghostwriting")
 *   5. its name, as a slug
 *   6. its type (`#pricing` for a `pricing` section), then a type that
 *      starts with it (`#faq` for `faq_accordion`) when only one does
 *
 * Within a step, the first section on the page wins.
 */
export function resolveSectionHash(hash: string, candidates: readonly AnchorCandidate[]): string | null {
  const h = decodeHash(hash)
  if (!h) return null
  if (h.startsWith(SECTION_ANCHOR_PREFIX)) {
    const id = h.slice(SECTION_ANCHOR_PREFIX.length)
    const own = candidates.find((c) => c.id === id)
    if (own) return own.id
  }
  const byId = candidates.find((c) => c.id === h)
  if (byId) return byId.id
  const slug = anchorSlug(h)
  if (!slug) return null
  const tiers: ((c: AnchorCandidate) => boolean)[] = [
    (c) => !!c.anchor && anchorSlug(c.anchor) === slug,
    (c) => !!c.heading && anchorSlug(c.heading) === slug,
    (c) => !!c.name && anchorSlug(c.name) === slug,
    (c) => anchorSlug(c.type) === slug,
  ]
  for (const tier of tiers) {
    const hit = candidates.find(tier)
    if (hit) return hit.id
  }
  const prefixed = candidates.filter((c) => anchorSlug(c.type).startsWith(`${slug}-`))
  return prefixed.length === 1 ? prefixed[0].id : null
}

/**
 * A link split into the page it names and the hash, when it has a hash and
 * names a page of this site: `#x` is this page (`path` null), `/#x` home,
 * `/about#x` About. Anything else, an external address included, is null.
 */
export function splitSectionHref(href: string): { path: string | null; hash: string } | null {
  const t = String(href ?? "").trim()
  const at = t.indexOf("#")
  if (at < 0) return null
  const hash = t.slice(at + 1)
  if (!hash || hash === "!") return null
  if (at === 0) return { path: null, hash }
  const before = t.slice(0, at)
  if (!before.startsWith("/") || before.startsWith("//")) return null
  return { path: normalizePath(before.split("?")[0]), hash }
}

/** `/about/` and `/about` are one page; `""` is home. */
export function normalizePath(path: string): string {
  const p = String(path ?? "").split("?")[0].split("#")[0]
  if (!p || p === "/") return "/"
  const withSlash = p.startsWith("/") ? p : `/${p}`
  return withSlash.replace(/\/+$/, "") || "/"
}

/**
 * The section a link on `currentPath` points at, or null when it points at
 * another page or at nothing on this one. What the link field shows instead
 * of the raw hash, and what the canvas scrolls to.
 */
export function sectionForHref(
  href: string,
  currentPath: string | null,
  sections: readonly SectionLike[],
): SectionLike | null {
  const split = splitSectionHref(href)
  if (!split) return null
  if (split.path !== null && (currentPath === null || split.path !== normalizePath(currentPath))) return null
  const id = resolveSectionHash(split.hash, candidatesOf(sections))
  return id ? (sections.find((s) => s.id === id) ?? null) : null
}

/**
 * The address a picked section is stored as. On a page with an address of
 * its own the page is part of it (`/#section-x`, `/about#section-x`), so the
 * same link works from the header, the footer, or another page; on a page
 * that is a template for many addresses (a product page) it is the hash
 * alone, which means "on whichever page this is".
 */
export function sectionHref(sectionId: string, pagePath: string | null): string {
  const hash = `#${sectionAnchor(sectionId)}`
  return pagePath ? `${normalizePath(pagePath)}${hash}` : hash
}

// ── Smooth scrolling ────────────────────────────────────────────────────────

/**
 * Ease in, ease out: the curve the big product sites scroll on. Starts
 * gently so the jump is not a lurch, settles gently so the section lands
 * rather than stops.
 */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/**
 * How long a scroll of `distance` pixels takes. Longer for further, but by
 * the square root, so a long page is not a long wait: 300px is about half a
 * second, 3000px under nine tenths, and nothing over one second.
 */
export function scrollDurationMs(distance: number): number {
  const d = Math.abs(distance)
  if (d < 1) return 0
  return Math.round(Math.min(1000, Math.max(380, 280 + Math.sqrt(d) * 11)))
}

// ── Entrance animation ──────────────────────────────────────────────────────

export const SECTION_ANIMATIONS = ["theme", "none", "fade", "fade_up", "zoom", "slide_left", "slide_right", "blur", "rise"] as const
export type SectionAnimationSetting = (typeof SECTION_ANIMATIONS)[number]
/**
 * How a section arrives. `slide_left` moves towards the left (it comes in
 * from the right) and `slide_right` the other way, the names the theme has
 * always stored. `blur` comes into focus as it fades and rises a little;
 * `rise` travels further up, for a page with few, tall sections.
 */
export type SectionAnimation = "none" | "fade" | "fade_up" | "zoom" | "slide_left" | "slide_right" | "blur" | "rise"

/** A section's own choice, for the panel: "Same as theme" and the four the owner listed. */
export const SECTION_ANIMATION_OPTIONS: { value: SectionAnimationSetting; label: string }[] = [
  { value: "theme", label: "Same as theme" },
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "fade_up", label: "Fade up" },
  { value: "rise", label: "Rise" },
  { value: "slide_right", label: "From the left" },
  { value: "slide_left", label: "From the right" },
  { value: "zoom", label: "Zoom" },
  { value: "blur", label: "Blur in" },
]

/** The theme's stored style, in this file's words. */
const THEME_STYLE: Record<string, SectionAnimation> = {
  "fade-up": "fade_up",
  "fade-in": "fade",
  "zoom-in": "zoom",
  "slide-left": "slide_left",
  "slide-right": "slide_right",
  "blur-in": "blur",
  rise: "rise",
  fade_up: "fade_up",
  fade: "fade",
  zoom: "zoom",
  none: "none",
}

/** What Theme settings › Animations asks for. Off unless switched on, as the stylesheet always read it. */
export function themeAnimation(theme: Record<string, unknown> | null | undefined): SectionAnimation {
  const t = theme ?? {}
  if (!t.animations_enabled) return "none"
  const style = typeof t.animation_style === "string" ? t.animation_style : "fade-up"
  return THEME_STYLE[style] ?? "fade_up"
}

/** A section's `animation` setting over the theme's. Anything unknown is "theme". */
export function resolveSectionAnimation(own: unknown, theme: Record<string, unknown> | null | undefined): SectionAnimation {
  if (typeof own === "string" && own !== "theme" && (SECTION_ANIMATIONS as readonly string[]).includes(own)) return own as SectionAnimation
  return themeAnimation(theme)
}

/** Theme settings › Animations › Alternate sides: sections come in from the left and the right in turn. */
export function themeAlternates(theme: Record<string, unknown> | null | undefined): boolean {
  const t = theme ?? {}
  return !!t.animations_enabled && t.animation_style === "alternate"
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** The theme's duration and the gap between sections arriving together, in ms. */
export function revealTiming(theme: Record<string, unknown> | null | undefined): { duration: number; stagger: number } {
  const t = theme ?? {}
  return { duration: num(t.animation_duration, 600, 150, 1500), stagger: num(t.animation_stagger, 80, 0, 300) }
}

/** Where each animation starts. Opacity and transforms only, so nothing is laid out again. */
export const REVEAL_FROM: Record<Exclude<SectionAnimation, "none">, { opacity: string; translate?: string; scale?: string; filter?: string }> = {
  fade: { opacity: "0" },
  fade_up: { opacity: "0", translate: "0 28px" },
  rise: { opacity: "0", translate: "0 64px" },
  zoom: { opacity: "0", scale: "0.94" },
  /* Far enough to read as coming from the side, short of the edge of a phone. */
  slide_left: { opacity: "0", translate: "48px 0" },
  slide_right: { opacity: "0", translate: "-48px 0" },
  blur: { opacity: "0", translate: "0 12px", filter: "blur(12px)" },
}

/** A long deceleration with no overshoot (an expo out): quick to start, soft to land. */
export const REVEAL_EASING = "cubic-bezier(0.16, 1, 0.3, 1)"

/** One section box as the reveal sees it. */
export interface RevealBox {
  type: string
  chrome: boolean
  /** The section's own `animation` setting, if any. */
  animation?: string | null
  /** It brings CSS animation of its own, which must not be animated twice. */
  ownMotion?: boolean
}

/**
 * Which boxes animate, and how: null for a box that never does. The header,
 * the footer and anything else marked chrome never move; the first body
 * section is on screen with the page, so it never moves either; a section
 * that set "none", or animates itself, is left alone.
 */
export function revealPlan(boxes: readonly RevealBox[], theme: Record<string, unknown> | null | undefined): (Exclude<SectionAnimation, "none"> | null)[] {
  let seenBody = false
  let side = false
  return boxes.map((b) => {
    if (b.chrome || isChromeType(b.type)) return null
    const first = !seenBody
    seenBody = true
    if (first) return null
    if (b.ownMotion) return null
    const a = resolveSectionAnimation(b.animation, theme)
    if (a === "none") return null
    /* Alternate sides: only for a section that follows the theme; one with its own choice keeps it. */
    if (themeAlternates(theme) && (b.animation == null || b.animation === "theme")) {
      side = !side
      return side ? "slide_right" : "slide_left"
    }
    return a
  })
}

/** CSS that declares an animation of its own. */
export function declaresOwnMotion(css: string): boolean {
  return /@keyframes|(^|[;{\s])animation(-name)?\s*:/i.test(css)
}

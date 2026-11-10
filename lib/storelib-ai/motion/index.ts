/**
 * ===========================================================================
 *  MOTION: ONE SITE-LEVEL FEEL, AND PRIMITIVES THAT READ IT (round O, O5)
 * ===========================================================================
 * Spec: DESIGN_INTELLIGENCE_2026 Part 5, implementation brief F.
 *
 * THE TIER. A website has one motion feel, `quiet`, `balanced` or
 * `expressive`, stored as the Theme setting `motion_tier` (Theme settings ›
 * Animations › Motion feel, and the agent's set_tokens motion.tier). It comes
 * out on the page root as CSS variables every AI component reads:
 *
 *   --t-motion-duration   entrances, reveals             (450 / 650 / 850ms)
 *   --t-motion-ease       entrances: ease out, a decisive settle
 *   --t-motion-distance   how far a reveal travels       (12 / 24 / 36px)
 *   --t-motion-stagger    between items of one reveal    (40 / 65 / 90ms)
 *   --t-motion-hover      hover and press                (160 / 200 / 240ms)
 *   --t-motion-ease-ui    hover and press: quick, not rubbery
 *   --t-motion-lift       a hover lift                   (2 / 4 / 6px)
 *   --t-motion-scale      an image's scale-in start      (1.03 / 1.06 / 1.1)
 *   --t-motion-parallax   a drift, % of the frame        (3 / 6 / 10%)
 *   --t-motion-on         1, or 0 when the visitor asked for less motion
 *
 * Every value sits inside the spec's 5.3 ranges. The page's stylesheet
 * (lib/website-builder/theme-css.ts themeStylesheet) zeroes the moving ones
 * under prefers-reduced-motion and on slow-refresh screens, with !important
 * so it beats the root's inline values: a component written with these
 * variables stands still for those visitors even if it forgot its own media
 * query (the examples still write one, the default being the still state).
 *
 * THE PRIMITIVES. MOTION_RECIPES lists the reusable effects (spec 5.2), each
 * a complete .storelib example under lib/storelib-ai/library/examples with
 * its editable params as schema settings, so a creator changes them in the
 * editor's sidebar like any other setting. tests/ai-motion-layout-o5.test.ts
 * compiles, draws and render-checks each one and holds it to the rules
 * (transform and opacity only, reduced motion, no scroll hijacking).
 *
 * Pure, no React, safe in the published page's bundle.
 */

export const MOTION_TIERS = ["quiet", "balanced", "expressive"] as const
export type MotionTier = (typeof MOTION_TIERS)[number]

/** The Theme setting the tier is stored under. */
export const MOTION_TIER_SETTING = "motion_tier"

export interface MotionTierParams {
  durationMs: number
  /** Entrances: ease out with a decisive settle. */
  ease: string
  distancePx: number
  staggerMs: number
  hoverMs: number
  /** Hover and press: responsive, not rubbery. */
  easeUi: string
  liftPx: number
  /** Where an image's scale-in starts (1 = none). */
  scaleFrom: number
  /** A drift's travel, % of its frame. */
  parallaxPct: number
  /** Scroll-linked showcase sequences (pinned or scrubbed) one regular page may hold. */
  showcasePerPage: number
  label: string
  /** What it suits and how it behaves, for the panel and the prompt. */
  describe: string
}

export const MOTION_TIER_PARAMS: Record<MotionTier, MotionTierParams> = {
  quiet: {
    durationMs: 450,
    ease: "cubic-bezier(0.25, 0.6, 0.3, 1)",
    distancePx: 12,
    staggerMs: 40,
    hoverMs: 160,
    easeUi: "cubic-bezier(0.3, 0.7, 0.4, 1)",
    liftPx: 2,
    scaleFrom: 1.03,
    parallaxPct: 3,
    showcasePerPage: 0,
    label: "Quiet",
    describe: "soft fades and short rises, crisp hover and focus, no pinned or scrubbed sequences; for professional services, wellness, local businesses and reading-heavy sites",
  },
  balanced: {
    durationMs: 650,
    ease: "cubic-bezier(0.2, 0.7, 0.2, 1)",
    distancePx: 24,
    staggerMs: 65,
    hoverMs: 200,
    easeUi: "cubic-bezier(0.3, 0.7, 0.4, 1)",
    liftPx: 4,
    scaleFrom: 1.06,
    parallaxPct: 6,
    showcasePerPage: 1,
    label: "Balanced",
    describe: "a headline reveal, staggered entrances, images that settle in, at most one scroll-linked showcase per page; for coaches, creators, shops and studios",
  },
  expressive: {
    durationMs: 850,
    ease: "cubic-bezier(0.16, 1, 0.3, 1)",
    distancePx: 36,
    staggerMs: 90,
    hoverMs: 240,
    easeUi: "cubic-bezier(0.25, 0.8, 0.35, 1)",
    liftPx: 6,
    scaleFrom: 1.1,
    parallaxPct: 10,
    showcasePerPage: 2,
    label: "Expressive",
    describe: "masked line reveals, image curtains, a sticky story or a sideways gallery, up to two showcase sequences per page; for photographers, artists, music, film and launches",
  },
}

export const DEFAULT_MOTION_TIER: MotionTier = "balanced"

export function isMotionTier(v: unknown): v is MotionTier {
  return typeof v === "string" && (MOTION_TIERS as readonly string[]).includes(v)
}

/** The tier a token motion level stands for: none is quiet (crisp feedback only), subtle balanced, expressive expressive. */
export function tierFromLevel(level: unknown): MotionTier {
  return level === "expressive" ? "expressive" : level === "none" ? "quiet" : "balanced"
}

/** The tier a visual concept's motion stance stands for (lib/storelib-ai/library/concept.ts MotionStance). */
export function tierFromStance(stance: unknown): MotionTier {
  return stance === "expressive" || stance === "cinematic" ? "expressive" : stance === "none" ? "quiet" : "balanced"
}

/**
 * A site's tier: the stored setting, else balanced, which is also what
 * Theme settings shows for a site that never chose one (the field's
 * default), so the panel and the page always agree.
 */
export function motionTierOf(theme: Record<string, unknown> | null | undefined): MotionTier {
  const v = theme?.[MOTION_TIER_SETTING]
  return isMotionTier(v) ? v : DEFAULT_MOTION_TIER
}

/** Whether a site prints the motion variables: one with a tier, or one whose tokens were set (an AI site). */
export function hasMotionTier(theme: Record<string, unknown> | null | undefined): boolean {
  return !!theme && (MOTION_TIER_SETTING in theme || "custom_tokens" in theme || "ai_section_y" in theme || "design_settings" in theme)
}

/** The `--t-motion-*` variables for a tier. */
export function tierVars(tier: MotionTier): Record<string, string> {
  const p = MOTION_TIER_PARAMS[tier]
  return {
    "--t-motion-tier": tier,
    "--t-motion-on": "1",
    "--t-motion-duration": `${p.durationMs}ms`,
    "--t-motion-ease": p.ease,
    "--t-motion-distance": `${p.distancePx}px`,
    "--t-motion-stagger": `${p.staggerMs}ms`,
    "--t-motion-hover": `${p.hoverMs}ms`,
    "--t-motion-ease-ui": p.easeUi,
    "--t-motion-lift": `${p.liftPx}px`,
    "--t-motion-scale": String(p.scaleFrom),
    "--t-motion-parallax": `${p.parallaxPct}%`,
  }
}

/**
 * A site's motion variables, spread into themeVars (the page root's style, in
 * the editor's canvas and on the live site alike). Empty for a site that
 * never had a tier or tokens, so an older theme site's page is byte for byte
 * what it was.
 */
export function motionVars(theme: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!hasMotionTier(theme)) return {}
  return tierVars(motionTierOf(theme))
}

/**
 * The stylesheet rule that stills every motion variable for a visitor who
 * asked for less motion (and for slow-refresh screens such as e-ink), with
 * !important because the tier's values are inline on the root. `root` is the
 * page root's selector (theme-css.ts THEME_ROOT_ATTRIBUTE).
 */
export function reducedMotionCss(root: string): string {
  const still = "--t-motion-on:0!important;--t-motion-duration:0ms!important;--t-motion-distance:0px!important;--t-motion-stagger:0ms!important;--t-motion-hover:0ms!important;--t-motion-lift:0px!important;--t-motion-scale:1!important;--t-motion-parallax:0%!important;"
  return `@media (prefers-reduced-motion:reduce),(update:slow){${root}{${still}}}`
}

/** The Theme setting's choices, as the panel lists them. */
export const MOTION_TIER_OPTIONS = MOTION_TIERS.map((t) => ({ value: t, label: MOTION_TIER_PARAMS[t].label }))

/* ── which tier fits a business ───────────────────────────────────────── */

const ASKED_LESS = /\b(?:no|less|minimal|little|without|calm|subtle|quiet|reduced)\s+(?:motion|animations?|movement|effects?)\b|\bstatic\b|\bno\s+scroll\s+effects?\b/i
const ASKED_MORE = /\b(?:lots? of|more|rich|bold|cinematic|immersive|expressive|heavy|playful)\s+(?:motion|animations?|movement|scroll(?:ing)?|effects?|interactions?)\b|\bawwwards\b|\banimated\b/i
const EXPRESSIVE_TRADES = /\b(?:photograph(?:er|y)|videograph(?:er|y)|film(?:maker)?|cinema|artist|art|gallery|music|producer|beats|dj|record label|band|fashion|launch|portfolio|motion design|animator|dance)\b/i
const QUIET_TRADES = /\b(?:accountant|lawyer|solicitor|legal|law firm|clinic|dentist|doctor|therapist|therapy|counsell?or|plumber|electrician|builder|cleaning|local|insurance|consultan(?:t|cy)|pilates|yoga|wellness|massage|physio|non-?profit|charity)\b/i

/**
 * The tier a brief suggests, deterministically: the creator's own words win
 * ("no animations", "lots of motion"), then the trade, then balanced.
 */
export function motionTierFor(text: string): MotionTier {
  const t = text ?? ""
  if (ASKED_LESS.test(t)) return "quiet"
  if (ASKED_MORE.test(t)) return "expressive"
  if (QUIET_TRADES.test(t)) return "quiet"
  if (EXPRESSIVE_TRADES.test(t)) return "expressive"
  return DEFAULT_MOTION_TIER
}

/* ── the recipe library ───────────────────────────────────────────────── */

export interface MotionRecipe {
  id: string
  name: string
  /** The working .storelib example (lib/storelib-ai/library/examples/<id>.storelib). */
  example: string
  trigger: "in-view" | "scroll-linked" | "hover" | "press" | "load" | "user-action" | "navigation"
  /** What it is for. */
  use: string
  /** Schema setting ids a creator edits it with. */
  params: string[]
  /** The tiers it belongs in. */
  tiers: MotionTier[]
  mobile: string
  lowPower: string
  reducedMotion: string
}

/**
 * The reusable primitives (spec 5.2), each a working example. Transform and
 * opacity only (clip-path for the two mask reveals, which the compositor
 * handles), CSS first, no scroll hijacking: the page always scrolls natively.
 */
export const MOTION_RECIPES: MotionRecipe[] = [
  { id: "reveal-stagger", name: "Reveal with stagger", example: "ai_scroll_reveal", trigger: "in-view", use: "default text and list sections arriving softly, one item after another", params: ["motion", "motion_strength"], tiers: ["quiet", "balanced", "expressive"], mobile: "shorter travel (60%) under 600px wide", lowPower: "scroll-driven on the compositor, no script, nothing observed", reducedMotion: "visible and still" },
  { id: "mask-reveal", name: "Masked line reveal", example: "ai_mask_reveal", trigger: "load", use: "an opening statement or a key line whose lines rise out of clipped masks", params: ["motion", "motion_strength", "stagger"], tiers: ["balanced", "expressive"], mobile: "same lines, shorter stagger; the creator's own line breaks so nothing reflows mid-word", lowPower: "one run on load, transform only", reducedMotion: "the full headline, still; screen readers read one heading" },
  { id: "stagger-headline", name: "Staggered headline", example: "ai_split_text", trigger: "load", use: "a statement whose lines step in one after another", params: ["motion", "motion_strength"], tiers: ["balanced", "expressive"], mobile: "same, shorter travel", lowPower: "one run on load", reducedMotion: "still" },
  { id: "image-scale-in", name: "Image curtain and scale-in", example: "ai_image_reveal", trigger: "scroll-linked", use: "one key photograph opening like a curtain and settling from a slight scale", params: ["motion", "motion_strength", "curtain"], tiers: ["balanced", "expressive"], mobile: "scale only, no curtain, under 600px wide", lowPower: "scroll-driven, transform and clip-path, once through", reducedMotion: "the photo, still and whole" },
  { id: "parallax-drift", name: "Slow image drift", example: "ai_parallax_media", trigger: "scroll-linked", use: "a full-bleed photo band with depth", params: ["strength"], tiers: ["balanced", "expressive"], mobile: "the same small travel; the crop keeps the subject", lowPower: "scroll-driven transform only", reducedMotion: "a still photo" },
  { id: "sticky-story", name: "Sticky storytelling", example: "ai_sticky_story", trigger: "scroll-linked", use: "a method or process: the picture stays while two to four steps pass beside it", params: ["motion", "layout"], tiers: ["balanced", "expressive"], mobile: "turns into plain sequential steps, each with its own picture", lowPower: "position: sticky and a view timeline crossfade; nothing pinned by script", reducedMotion: "every picture beside its own step, no crossfade" },
  { id: "sticky-stack", name: "Stacked panels", example: "ai_sticky_stack", trigger: "scroll-linked", use: "offers or chapters that stack as you scroll", params: [], tiers: ["balanced", "expressive"], mobile: "only with enough height (560px)", lowPower: "position: sticky only", reducedMotion: "a plain list" },
  { id: "horizontal-gallery", name: "Horizontal scroll section", example: "ai_hscroll_gallery", trigger: "user-action", use: "a body of visual work moving sideways under the visitor's own swipe or scroll", params: [], tiers: ["balanced", "expressive"], mobile: "native swipe with snap points and a progress bar", lowPower: "native scrolling, the bar on a scroll timeline", reducedMotion: "no snapping" },
  { id: "marquee", name: "Marquee with pause", example: "ai_marquee", trigger: "load", use: "a running line of real words: dates, a release, today's list", params: ["speed"], tiers: ["balanced", "expressive"], mobile: "same speed in seconds per loop", lowPower: "one transform animation; pauses on hover and focus", reducedMotion: "a wrapped still line" },
  { id: "hover-lift", name: "Hover lift and press", example: "ai_hover_lift", trigger: "hover", use: "links and cards that answer the pointer: a small lift, an image pan, a press", params: ["motion", "motion_strength"], tiers: ["quiet", "balanced", "expressive"], mobile: "no hover; the press (active) state stays", lowPower: "transitions on transform only", reducedMotion: "colour and underline feedback, no movement" },
  { id: "cursor-aware", name: "Cursor-aware tilt", example: "ai_cursor_tilt", trigger: "hover", use: "one showcase image or product that tilts a few degrees toward the pointer", params: ["motion", "tilt"], tiers: ["expressive"], mobile: "off on touch: (hover: hover) and (pointer: fine) only", lowPower: "nine CSS hover zones, no pointer tracking script", reducedMotion: "flat" },
  { id: "hover-index", name: "Image swap on project hover", example: "ai_hover_reveal_list", trigger: "hover", use: "a project or programme index whose picture appears beside the hovered row", params: [], tiers: ["balanced", "expressive"], mobile: "each row keeps its own small picture", lowPower: "transitions only", reducedMotion: "no movement" },
  { id: "counter", name: "Counter from real numbers", example: "ai_counters", trigger: "scroll-linked", use: "numbers the creator typed counting up as they come into view", params: [], tiers: ["balanced", "expressive"], mobile: "same", lowPower: "an @property integer on a view timeline", reducedMotion: "the final number" },
  { id: "page-transition", name: "Page transitions", example: "", trigger: "navigation", use: "continuity between pages: the Theme setting Animations › Between pages (the browser's own view transition, live site only)", params: ["page_transition", "page_transition_duration"], tiers: ["balanced", "expressive"], mobile: "same", lowPower: "the browser's view transition; never blocks loading", reducedMotion: "none" },
]

export function recipeById(id: string): MotionRecipe | undefined {
  return MOTION_RECIPES.find((r) => r.id === id)
}

/** The page transition a tier suggests for a new site (Theme settings › Animations › Between pages). */
export function pageTransitionFor(tier: MotionTier): { page_transition: string; page_transition_duration: number } {
  return tier === "quiet" ? { page_transition: "none", page_transition_duration: 300 } : tier === "balanced" ? { page_transition: "fade", page_transition_duration: 300 } : { page_transition: "rise", page_transition_duration: 400 }
}

/* ── what the agent is told ───────────────────────────────────────────── */

/** The motion rules for a site at `tier`, for a prompt. */
export function motionForPrompt(tier: MotionTier = DEFAULT_MOTION_TIER): string {
  const p = MOTION_TIER_PARAMS[tier]
  const recipes = MOTION_RECIPES.filter((r) => r.tiers.includes(tier) && r.example)
  return `MOTION (this site's feel: ${tier}; set it with set_tokens motion.tier, the creator changes it in Theme settings › Animations › Motion feel)
- ${p.label}: ${p.describe}.
- One motion signature per site (a masked headline, an image curtain or an editorial slide) plus quiet feedback on hover, focus and press. Never every trick on one page. At most ${p.showcasePerPage} scroll-linked showcase sequence${p.showcasePerPage === 1 ? "" : "s"} (sticky story, sideways gallery, pinned chapter) per page.
- Read the site's motion variables, never hard coded timings: var(--t-motion-duration, ${p.durationMs}ms), var(--t-motion-ease, ${p.ease}), var(--t-motion-distance, ${p.distancePx}px), var(--t-motion-stagger, ${p.staggerMs}ms), var(--t-motion-hover, ${p.hoverMs}ms) with var(--t-motion-ease-ui), var(--t-motion-lift, ${p.liftPx}px), var(--t-motion-scale, ${p.scaleFrom}), var(--t-motion-parallax, ${p.parallaxPct}%). They are zero for visitors who asked for less motion.
- Give each moving section editable params in its schema: a "motion" select ("site": follows the site, "off": still), a "motion_strength" range (0 to 150, %), and its own where they matter (stagger, speed, tilt). Print them as data-motion="{{ settings.motion }}" and --m-k: calc({{ settings.motion_strength }} / 100).
- transform and opacity only (clip-path for a mask). Never animate width, height, top, left or box-shadow, never transition: all. Write the still state as the default and add motion inside @media (prefers-reduced-motion: no-preference) and @supports (animation-timeline: view()); nothing is hidden when either is missing.
- Native scrolling always: no scroll hijacking, no smooth-scroll library, no preloader, no content gated behind an animation. Under 600px wide, shorter travel and sticky or pinned effects become plain sequential content. Hover effects only in @media (hover: hover) and (pointer: fine); the press state stays for touch.
- Working primitives to adapt (search_knowledge by id): ${recipes.map((r) => `${r.example} (${r.name.toLowerCase()})`).join(", ")}. Page transitions are the Theme setting Animations › Between pages.`
}

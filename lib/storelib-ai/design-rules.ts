/**
 * ===========================================================================
 *  THE DESIGN RULES EVERY STORELIB AI PROMPT CARRIES (round O)
 * ===========================================================================
 * TODO(integrator, round O): this file is O6's STUB of O3's module. O3 owns
 * lib/storelib-ai/design-rules.ts (anti-ai-slop.md distilled plus spec 8.1);
 * when its branch merges, take O3's file whole. The names and shapes below
 * are the ones fixed in the round O brief, so every caller O6 wired
 * (lib/storelib-ai/surfaces.ts and the prompts it feeds) keeps compiling:
 *
 *   DESIGN_RULES               string, stable
 *   designRulesFor(surface)    string, stable per surface (cached prefixes)
 *
 * If O3's surface names differ from DesignSurface here, the only place to
 * map them is lib/storelib-ai/surfaces.ts (DESIGN_SURFACE).
 *
 * Until then the text below is a real, compact distillation, so a branch
 * without O3 still steers every surface away from the slop Andrew saw.
 *
 * PURE TEXT. No date, no job, no site: it sits in cached system prefixes.
 */

/** Every AI surface that designs or edits a website's look. */
export type DesignSurface =
  /** The website agent (lib/ai-builder/agent): new sites, redesigns, edits. */
  | "site_agent"
  /** The editor's Ask for a change agent (lib/website-builder/agent/loop.ts). */
  | "editor_agent"
  /** The section writer (lib/website-builder/agent/write-section.ts): Code a section, the classic coder. */
  | "section_writer"
  /** The classic pipeline's site planner (lib/website-builder/agent/site-plan.ts). */
  | "classic_planner"
  /** The classic pipeline's copy filler (lib/website-builder/ai-site/fill.ts). */
  | "classic_fill"
  /** The Storelib Sites coding agent (lib/sites/agent/loop.ts), React on Vite. */
  | "sites_agent"

const FIT = `FIT THE BUSINESS. The look comes from this business, the people who visit it and the direction chosen for it, never from a house default. A personal trainer reads as performance and energy, with real training photography and a booking action; a law firm as calm authority; a beat maker as its own scene and era. What the creator explicitly asks for, and what their site has already established, outrank every rule here. If the result could belong to any business, it is not done.`

const CLICHES = `REJECT CLICHE COMBINATIONS (one of these alone can be right for a brand; the bundle as a default is the machine-made look):
- Editorial serif slop: an italic or high contrast display serif (Instrument Serif, Fraunces, Playfair, DM Serif, Cormorant and the like) on a cream or off-white page, with mono or letter-spaced uppercase labels and captions and a terracotta or rust accent.
- Purple, violet or indigo as the accent, two stop gradients on a hero (purple to blue, blue to cyan), glows, glassmorphism, blobs and decorative waves.
- A centred slogan hero over empty space; three equal rounded cards as the second section; an icon on every card; a floating dashboard mockup for a business with no dashboard.
- A small uppercase label or pill above every heading; everything at a large radius with a soft shadow; a rounded card with a coloured left border.
- Hero, features, pricing, FAQ, call to action in that order with nothing changed; the same layout for a coach, a photographer and a consultant.
- Motion on everything: endless marquees, a reveal on every element, scroll hijacking.`

const HONEST = `HONEST CONTENT. Never invent testimonials, ratings, client logos, metrics ("10x faster", "98% satisfaction"), prices, credentials or years in business. No filler (lorem ipsum, "feature one"). No emoji as icons. No instruction to the creator in the visible copy ("Add your portrait here", "PHOTO: YOUR NAME", "Your story goes here"): use real data, leave the part out, or give it an editable empty state that only shows in the editor.`

const CRAFT = `CRAFT. Proven patterns for most of it and one bold move that makes it this brand's (a type choice, a colour decision, an unexpected proportion). Type chosen for this brand with a real hierarchy; body 16 to 18px, lines of 45 to 75 characters. Colours from the site's tokens, the accent kept for actions and key facts. Rhythm that changes on purpose: dense and open, wide and narrow. Designed for a phone first, 44px tap targets, nothing scrolls sideways. Visible focus, text at 4.5:1, everything still under prefers-reduced-motion.`

/** The rules, whole. Stable. */
export const DESIGN_RULES = [FIT, CLICHES, HONEST, CRAFT].join("\n")

const PER_SURFACE: Record<DesignSurface, string> = {
  site_agent: "",
  editor_agent: "ON AN EXISTING SITE its design contract (DESIGN.md) and tokens are the direction: new work matches them, and fonts, colours and tokens change only when asked.",
  section_writer: "A NEW SECTION ON AN EXISTING SITE belongs to that site: its fonts, colour schemes, spacing and motion, unless the request asks for something else.",
  classic_planner: "",
  classic_fill: "These rules apply to the words you write: specific to this business, nothing invented, no slot for the creator to fill.",
  sites_agent: "The design tokens live at the top of src/styles.css: choose them for this business on a new site, keep them on an existing one unless asked.",
}

/** The rules for one surface: DESIGN_RULES plus that surface's one line. Stable per surface. */
export function designRulesFor(surface: DesignSurface): string {
  const extra = PER_SURFACE[surface] ?? ""
  return `DESIGN RULES\n${DESIGN_RULES}${extra ? `\n${extra}` : ""}`
}

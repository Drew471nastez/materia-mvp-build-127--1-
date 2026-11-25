/**
 * ===========================================================================
 *  THE CLOSEST TEMPLATE, AS A PATTERN
 * ===========================================================================
 * Storelib's templates (CODE_TEMPLATES, theme-packages/materia/templates/*)
 * are the reference for how a site is built here: which pages, which
 * sections in which order, how the colour schemes alternate, which fonts.
 * `chooseMateriaTemplate` picks the one closest to the creator's business
 * from their words (and the example they picked, and what they sell), with
 * no model call; `templateReferenceText` writes it as a pattern for the
 * prompt: structure, section order, settings style and fonts, never its
 * words, products or pictures.
 *
 * Pure. The scoring is plain word overlap with weights, so a test can say
 * exactly why a coach gets a coaching template.
 */
import { MATERIA_CATALOGUE } from "./catalogue.generated"
import { cut, materiaSection } from "./catalogue"
import type { MateriaTemplateEntry } from "./build"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"

/**
 * What each template is for, in the words a creator uses about their own business. The briefs in
 * marketplace-shared.ts say how a template looks; these say who it suits. Keep one line per template.
 */
export const TEMPLATE_KEYWORDS: Record<string, string> = {
  default: "general shop store goods homeware home gifts mugs candles candle soap ceramics lifestyle stationery",
  clothing: "clothing apparel fashion label wear coat knitwear tailoring boutique womenswear menswear",
  merch: "merch band artist hoodie hoodies tour fans tees",
  digital: "digital downloads download guide presets icons fonts luts files assets",
  artbooks: "art book books prints museum painting paintings editions pdf",
  ebooks: "cookbook cookbooks recipes recipe food cooking kitchen nutrition baking bread",
  fitness: "fitness gym strength training workout workouts program programs conditioning athletes",
  landing: "course courses school classes lessons students academy editing",
  creator: "creator personal homepage links writer newsletter portfolio photographer photography",
  streetwear: "streetwear lifestyle label drop drops sneakers skate urban",
  samples: "samples sample packs beats producer producers music loops drums",
  workspace: "notion templates template planner planners productivity workspace",
  space: "clothing night dark cosmic space glow apparel",
  posters: "posters poster prints print art wall decor illustration framed photography",
  coach: "coach coaching running runner runners marathon plans sessions call",
  vsl: "video sales letter course webinar funnel call",
  course2: "online course guitar lessons curriculum music",
  courselanding: "course pilates yoga wellness online programme program",
  retro: "merch retro y2k pixel desktop gaming nostalgia",
  authorbook: "ebook book author guide playbook reader readers",
  creatorpro: "content creator youtube podcast online business videos courses newsletter",
  coachpro: "coach personal brand podcast programmes mentor mentoring business life coaching worksheet",
  trainer: "personal trainer strength coach clients gym training programs fitness",
  renaissance: "course funnel ai business bonuses launch masterclass",
  xpshop: "merch retro desktop sunny playful",
  capstees: "caps tees hats tshirts minimal apparel basics",
  podshop: "print on demand apparel gifts tees mugs custom",
  outerwear: "outerwear jackets jacket coats label technical outdoor",
  vslfunnel: "video sales letter course watercolour watercolor painting art class teacher",
  notionpage: "notion template sales page digital product system",
  rail: "streetwear drop label garments lookbook clothing",
  notionsite: "notion templates creator shop digital",
  soundpacks: "sound packs samples label producer beats audio presets synth",
}

/** The example a person picked on Describe your website, and the templates built for that kind of business. */
export const CATEGORY_TEMPLATES: Record<string, string[]> = {
  candle_shop: ["default", "posters"],
  fitness_coach: ["trainer", "fitness", "coach"],
  photographer: ["creator", "posters", "artbooks"],
  online_course: ["courselanding", "course2", "landing", "vslfunnel"],
}

const STOP = new Set(
  "a an and the of for to in on with my our your their its it is are be by from at as or that this these those i we you me us them who what which how page website site web shop store online sell sells selling business want need make made built build theme sections section own round owner reference after one two three new".split(" "),
)

const stem = (w: string) => (w.length > 4 ? w.replace(/(ies)$/, "y").replace(/(es|s)$/, "") : w)

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)
}

export interface TemplateChoice {
  template: MateriaTemplateEntry
  score: number
  /** The words that matched, for the log and the test. */
  matched: string[]
  /** The next best, so a prompt can mention an alternative. */
  runnerUp: MateriaTemplateEntry | null
}

/** Every template the catalogue has, in CODE_TEMPLATES order. */
export function materiaTemplates(): readonly MateriaTemplateEntry[] {
  return MATERIA_CATALOGUE.templates
}

export function materiaTemplate(id: string): MateriaTemplateEntry | undefined {
  return MATERIA_CATALOGUE.templates.find((t) => t.template === id || t.slug === id)
}

/**
 * The template closest to this business. Strong words (TEMPLATE_KEYWORDS) count 3, its name and category 2, its
 * brief, sample shop and products 1; the example the person picked adds 6 to the templates made for it. Nothing
 * matched: Storelib Default, the general shop.
 */
export function chooseMateriaTemplate(input: { prompt: string; category?: string | null; extra?: string }): TemplateChoice {
  const asked = new Set(words(`${input.prompt} ${input.extra ?? ""}`.slice(0, 4_000)))
  const scored = MATERIA_CATALOGUE.templates.map((t, order) => {
    const strong = new Set(words(TEMPLATE_KEYWORDS[t.template] ?? ""))
    const named = new Set(words(`${t.name} ${t.category}`))
    const weak = new Set(words(`${t.brief} ${t.shop ?? ""} ${(t.products ?? []).join(" ")}`))
    let score = 0
    const matched: string[] = []
    for (const w of asked) {
      const s = strong.has(w) ? 3 : named.has(w) ? 2 : weak.has(w) ? 1 : 0
      if (s) {
        score += s
        matched.push(w)
      }
    }
    const boost = input.category ? CATEGORY_TEMPLATES[input.category]?.indexOf(t.template) ?? -1 : -1
    if (boost >= 0) score += 6 - boost
    return { t, score, matched, order }
  })
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  const best = scored[0]
  if (!best || best.score === 0) {
    const fallback = materiaTemplate("default") ?? MATERIA_CATALOGUE.templates[0]
    return { template: fallback, score: 0, matched: [], runnerUp: null }
  }
  return { template: best.t, score: best.score, matched: best.matched, runnerUp: scored[1]?.score ? scored[1].t : null }
}

const styleText = (style: Record<string, unknown> | undefined) =>
  style
    ? Object.entries(style)
        .map(([k, v]) => (k === "color_scheme" ? String(v) : `${k} ${String(v)}`))
        .join(", ")
    : ""

/**
 * The template as a pattern for the prompt: what it is, its fonts and schemes, home in order with each section's
 * purpose, style and blocks, the other pages as their order. Cut at a whole line to `budget`.
 */
export function templateReferenceText(t: MateriaTemplateEntry, opts: { budget?: number; why?: string[] } = {}): string {
  const budget = opts.budget ?? 3_500
  /* Only the display face: an AI default face is fine for body text (MATERIA_RULES). */
  const slop = [t.fonts.heading].filter((f): f is string => !!f && isSlopDisplayFont(f))
  const home = t.pages.find((p) => p.key === "home")
  const lines = [
    `REFERENCE TEMPLATE: "${t.name}" (${t.template}), the closest of Storelib's ${MATERIA_CATALOGUE.templates.length} Materia templates to this business${opts.why?.length ? ` (matched on: ${opts.why.slice(0, 8).join(", ")})` : ""}. A pattern for the structure, never its words, names, products or pictures.`,
    `What it is: ${t.brief}`,
    `Fonts: ${t.fonts.heading ?? "theme default"}${t.fonts.headingWeight !== undefined ? ` ${t.fonts.headingWeight}` : ""} for headings, ${t.fonts.body ?? "theme default"} for body${slop.length ? ` (${slop.join(" and ")} ${slop.length === 1 ? "is an AI default face" : "are AI default faces"}: keep the voice, choose a face with more character for display)` : ""}.`,
    t.schemes.length ? `Colour schemes: ${t.schemes.map((s) => `${s.id} ${s.background ?? "?"} on ${s.text ?? "?"}${s.button ? `, button ${s.button}` : ""}`).join("; ")}.` : "",
    `Header: ${t.header.join(", ") || "header"}. Footer: ${t.footer.join(", ") || "footer"}.`,
    home ? `HOME, in order (Materia section [what it does]: scheme and style; blocks):` : "",
    ...(home?.sections ?? []).map((s, i) => {
      const purpose = materiaSection(s.type)?.purpose
      const style = styleText(s.style)
      return `${i + 1}. ${s.type}${purpose ? ` [${purpose}]` : ""}${style ? `: ${style}` : ""}${s.blocks?.length ? `; ${s.blocks.join(", ")}` : ""}`
    }),
    ...t.pages.filter((p) => p.key !== "home").map((p) => `PAGE ${p.key}: ${p.sections.map((s) => s.type).join(", ")}`),
  ].filter(Boolean)
  return cut(lines, budget)
}

/** The section types the template's home places, in order (the details a prompt shows first). */
export function referenceFocus(t: MateriaTemplateEntry): string[] {
  return (t.pages.find((p) => p.key === "home")?.sections ?? []).map((s) => s.type)
}

/**
 * The classic Start with AI planner's pattern (lib/website-builder/agent/site-plan.ts sitePlanTurn): the closest
 * template, to be mapped onto the section types that planner is offered. Its own types are the theme's, so the
 * pattern is the page set, the running order and the rhythm, never Materia's type names.
 */
export function plannerReference(input: { prompt: string; category?: string | null; extra?: string }, budget = 2_400): string {
  const choice = chooseMateriaTemplate(input)
  return `HOW STORELIB'S TEMPLATES ARE BUILT (the pattern for this plan: take the page set, the running order of jobs and the rhythm of colour schemes, and give each slot the listed section type that does that job, or custom; never its words, names or products)\n${templateReferenceText(choice.template, { budget, why: choice.matched })}`
}

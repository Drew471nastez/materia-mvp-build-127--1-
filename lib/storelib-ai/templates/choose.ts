/**
 * ===========================================================================
 *  WHICH TEMPLATE A NEW SITE STARTS FROM
 * ===========================================================================
 * Deterministic, from round O's CreativeBrief (O2: the business kind, the
 * styles asked for by name, the creator's words) and round O5's site story
 * (the brief's `story`), and the direction chosen for the job when there is
 * one. Scores, in order of weight:
 *
 *   the site story the template tells        +6
 *   the business kind (first listed +5, else +4)
 *   the art direction chosen for the job      +3 primary, +1 secondary
 *   a direction the creator asked for by name +3
 *   the template's own words in the prompt    +1 each, at most 3
 *   a template recent sites of this creator used: -2 (variety)
 *
 * Under MIN_SCORE nothing fits closely enough and the agent builds from
 * nothing (null): a law firm never starts from a coffee shop. Ties go to the
 * gallery's order.
 *
 * Pure. Browser safe.
 */
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { DirectionChoice } from "@/lib/storelib-ai/direction/choose"
import { SITE_TEMPLATES } from "./registry"
import type { SiteTemplate } from "./types"

export const MIN_SCORE = 5

export interface TemplateChoice {
  template: SiteTemplate | null
  score: number
  /** Why, as short sentences. */
  reasons: string[]
  /** The next closest, best first (at most two), for the agent to borrow from or switch to. */
  alternates: { id: string; score: number }[]
}

type BriefLike = Pick<CreativeBrief, "prompt" | "business" | "story" | "style"> & Partial<Pick<CreativeBrief, "category" | "businessType">>

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim()} `

function score(t: SiteTemplate, brief: BriefLike, choice: Pick<DirectionChoice, "primary" | "secondary"> | null, avoid: string[]): { n: number; why: string[] } {
  let n = 0
  const why: string[] = []
  /*
    Round 56: "local professional" is a catch-all story (an accountant, a salon, a consultancy); it brings a template
    only for a trade the template was made for, so a barber's template never starts a consultancy.
  */
  const broadStory = brief.story === "local-professional" && !t.industries.includes(brief.business.kind)
  if (brief.story && t.stories.includes(brief.story) && !broadStory) {
    n += 6
    why.push(`tells the ${brief.story} story`)
  }
  const at = t.industries.indexOf(brief.business.kind)
  if (at === 0) {
    n += 5
    why.push(`made for ${brief.business.label}`)
  } else if (at > 0) {
    n += 4
    why.push(`fits ${brief.business.label}`)
  }
  if (choice) {
    if (t.directionIds.includes(choice.primary.id)) {
      n += 3
      why.push(`in the ${choice.primary.name} direction`)
    } else if (choice.secondary && t.directionIds.includes(choice.secondary.id)) {
      n += 1
      why.push(`near the ${choice.secondary.name} influence`)
    }
  }
  const asked = brief.style.requested.filter((id) => t.directionIds.includes(id))
  if (asked.length) {
    n += 3
    why.push(`the style asked for (${asked.join(", ")})`)
  }
  const text = words([brief.prompt, brief.businessType ?? "", brief.category ?? ""].join(" "))
  const hits = t.keywords.filter((k) => text.includes(words(k))).slice(0, 3)
  if (hits.length) {
    n += hits.length
    why.push(`the prompt says ${hits.map((h) => `"${h}"`).join(", ")}`)
  }
  if (avoid.includes(t.id)) {
    n -= 2
    why.push("used recently, so a little less likely")
  }
  return { n, why }
}

/**
 * The template a new site starts from, or null when none is close. `choice`
 * is the job's chosen direction (lib/storelib-ai/direction chooseDirection);
 * `avoid` the template ids the creator's recent sites started from.
 */
export function chooseTemplate(brief: BriefLike, opts: { choice?: Pick<DirectionChoice, "primary" | "secondary"> | null; avoid?: string[]; templates?: readonly SiteTemplate[] } = {}): TemplateChoice {
  const list = opts.templates ?? SITE_TEMPLATES
  const scored = list.map((t, i) => ({ t, i, ...score(t, brief, opts.choice ?? null, opts.avoid ?? []) })).sort((a, b) => b.n - a.n || a.i - b.i)
  const best = scored[0]
  const alternates = scored.slice(1, 3).filter((x) => x.n >= MIN_SCORE).map((x) => ({ id: x.t.id, score: x.n }))
  if (!best || best.n < MIN_SCORE) return { template: null, score: best?.n ?? 0, reasons: ["No template is close to this business: build from the brief."], alternates }
  return { template: best.t, score: best.n, reasons: [`${best.t.name}: ${best.why.join("; ")}.`], alternates }
}

/**
 * ===========================================================================
 *  "MAKE IT CLEANER" IS ABOUT THE THING YOU JUST MADE
 * ===========================================================================
 * Add a testimonials section, then say "make it cleaner", "change the
 * layout" or "add more settings". With nothing selected the run used to be
 * handed the whole page and a pronoun: it guessed, read sections to find out,
 * and sometimes tidied the hero as well, or built a second testimonials
 * section beside the first.
 *
 * The project's memory already records each change (./project-state.ts,
 * `recent`); it now records which sections, by id. So a follow up with
 * nothing selected is a change to the section the last run made or changed:
 * the run is shown that section in full, as if it were selected, and every
 * write to anything else is refused with a sentence the model can act on.
 *
 * Only when that reading is safe: the last change touched exactly one
 * section that is still on the page, and the message does not reach wider
 * (the page, the site, the header or the menu, a new section, or another
 * section by name). Otherwise the run is told what the last change was and
 * decides, as before.
 *
 * Pure.
 */

import type { Intent } from "./intent"
import type { ProjectBrief } from "./project-state"

/** Words that reach past one section: the run decides for itself. */
const WIDER = /\b(page|pages|site|website|everything|all (?:the )?sections|every section|whole|entire|header|footer|menu|nav(?:igation)?|theme|palette|fonts?|brand|logo)\b/i
const NEW_SECTION = /\b(?:add|insert|create|build|make|put)\b[^.?!]{0,30}\b(?:new |another |a |an )?(?:section|page|band|row)\b(?!\s*settings?)/i
/** A section named by what it is: when it is not the last one, the message is about that one. */
const SECTION_WORDS = /\b(hero|banner|faq|faqs|pricing|plans?|gallery|testimonials?|reviews?|features?|newsletter|signup|cta|about|contact|products?|collections?|events?|countdown|slider|carousel|video|team|stats|logos|timeline)\b/gi

export interface FollowUpTarget {
  /** The section the message is about. */
  id: string
  /** Every write to anything else is refused. */
  scoped: boolean
}

export function followUpTarget(opts: {
  intent: Intent | null | undefined
  prompt: string
  brief: ProjectBrief | null | undefined
  sections: readonly { id: string; type: string; name?: string; group?: string }[]
  selectedSectionId?: string
}): FollowUpTarget | null {
  if (!opts.intent?.followUp || opts.selectedSectionId) return null
  if (opts.intent.kind === "QUESTION" || opts.intent.plan) return null
  const last = opts.brief?.recent?.[opts.brief.recent.length - 1]
  const ids = (last?.ids ?? []).filter((id) => {
    const s = opts.sections.find((x) => x.id === id)
    return !!s && s.type !== "header" && s.type !== "footer" && !s.group
  })
  if (ids.length !== 1) return null
  const target = opts.sections.find((s) => s.id === ids[0])!
  const text = opts.prompt.replace(/\s+/g, " ").trim()
  if (WIDER.test(text) || NEW_SECTION.test(text)) return null
  const own = `${target.type} ${target.name ?? ""}`.toLowerCase().replace(/_/g, " ")
  for (const m of text.matchAll(SECTION_WORDS)) {
    const word = m[1].toLowerCase().replace(/s$/, "")
    if (!own.includes(word)) return null
  }
  return { id: target.id, scoped: true }
}

/**
 * ===========================================================================
 *  EDIT THE OPEN SECTION, OR MAKE A NEW ONE: SAID BEFORE ENTER (round 69)
 * ===========================================================================
 * The owner: "Storelib AI, which can create new sections or edit current
 * sections, should be smart and know how to make the distinction ... It
 * should be easy for people to see, understand and apply."
 *
 * What went wrong before this: selecting a section turned the "Editing:
 * <Name>" lock on by itself, and a locked request was never read for what it
 * asked. "Add a newsletter signup below this" with the hero open was locked
 * to the hero, so a signup form was written into the hero's code. The
 * reading that could tell (./agent/selection-intent.ts) ran only when the
 * lock was off, and the lock was always on.
 *
 * Now the words and the selection are read HERE, in the browser, as the
 * person types, and the box says what Enter will do:
 *
 *   Editing: Hero                  the open section changes, and only it
 *   New section below Hero         a new one, placed beside the open one
 *   Replacing Hero                 "turn this into a FAQ": a new one in its place
 *   New section at the top         nothing open, the words ask for a section
 *
 * One tap switches between editing and a new section, and a tap on the place
 * flips it above or below. What the box shows is what is sent (`aim` in the
 * decide and agent requests), and the server honours it, so the label is the
 * behaviour, not a guess about it. Pure: tests/section-ai-r69.test.ts.
 */
import { readSelection, type SelectedShape } from "@/lib/website-builder/agent/selection-intent"

export type AimKind = "edit" | "new" | "replace"
/** "auto" follows the words; the others are the person's tap, kept until the selection changes or a message goes. */
export type AimChoice = "auto" | "edit" | "new"
export type AimWhere = "below" | "above" | "top" | "bottom"

export interface SectionAim {
  kind: AimKind
  /** Who decided: the words, or the person's tap. */
  by: "words" | "choice"
  /** For a new section: where, in words, and as add_section's index (the page's whole list, header included). */
  where?: AimWhere
  index?: number
  /** The kind of section the words name, when they name one ("testimonials"). */
  named?: string
}

/* Section sized things placed beside the open one in words: "show our reviews under this", "a block with our hours after this". */
const PLACED_THING = /\b(?:below|under|after|beneath|underneath|above|before|over)\s+(?:this|it|the selected|that)(?:\s+(?:section|one))?\b/i
const SECTION_THING = /\b(?:section|band|strip|block|row|area|testimonials?|reviews?|faqs?|questions|pricing|plans|gallery|newsletter|sign ?up|map|team|stats|timeline|steps|video|logos?|countdown|features?|benefits|contact|opening hours|hours)\b/i
/* "A new one like this", "another one for our workshops": a copy made into something else. */
const ANOTHER_ONE = /\b(?:a new|another|a second|one more)\s+one\b|\b(?:copy|duplicate|clone|recreate|replicate)\s+(?:this|it|the selected)(?:\s+(?:section|one))?\b/i
/* No section open: words that ask for a section of its own. */
const NEW_SECTION_WORDS =
  /\b(?:new|another|extra|second|separate|additional)\s+(?:[a-z-]+\s+){0,3}section\b|\b(?:add|create|build|make|write|design|insert|put|give me|i (?:need|want)|we (?:need|want))\b(?:\s+(?:me|us))?\s+(?:an?|one|some)\s+[^.?!]{0,50}\bsection\b|^\s*an?\s+[^.?!]{0,60}\bsection\b/i
const TOP = /\bat the (?:very )?top(?: of the page)?\b|\bfirst on the page\b/i
const BOTTOM = /\bat the (?:very )?(?:bottom|end)(?: of the page)?\b|\babove the footer\b|\blast section\b|\bbottom of the page\b/i

/** Where `readSelection`'s index sits beside the open section, in words. */
function whereOf(index: number | undefined, selected: SelectedShape, prompt: string): AimWhere {
  if (TOP.test(prompt)) return "top"
  if (BOTTOM.test(prompt)) return "bottom"
  if (index === selected.position) return "above"
  return "below"
}

/** The add_section index for a place beside the open section (or at either end of the page). */
export function aimIndex(where: AimWhere, selected: SelectedShape | null, total: number): number {
  if (where === "top") return 1
  if (where === "bottom") return Math.max(1, total - 1)
  if (!selected) return 1
  return where === "above" ? selected.position : selected.position + 1
}

/** What the words alone ask for, with a section open or not. */
export function readAim(prompt: string, selected: SelectedShape | null): SectionAim | null {
  const text = prompt.replace(/\s+/g, " ").trim()
  if (!selected) {
    if (!text || !NEW_SECTION_WORDS.test(text)) return null
    const where: AimWhere = BOTTOM.test(text) ? "bottom" : "top"
    return { kind: "new", by: "words", where }
  }
  const read = readSelection(text, selected)
  if (read.aim === "replace") return { kind: "replace", by: "words", index: selected.position, named: read.named }
  if (read.aim === "new") {
    const where = whereOf(read.index, selected, text)
    return { kind: "new", by: "words", where, index: aimIndex(where, selected, selected.total), named: read.named }
  }
  /* Beside the open section, in words, a thing of section size: a new one, not more of the open one. */
  if (read.aim === "edit" && ((PLACED_THING.test(text) && SECTION_THING.test(text.replace(PLACED_THING, ""))) || ANOTHER_ONE.test(text))) {
    const where = /\b(?:above|before|over)\s+(?:this|it|the selected|that)\b/i.test(text) ? "above" : "below"
    return { kind: "new", by: "words", where, index: aimIndex(where, selected, selected.total) }
  }
  /* "Add testimonials" with the FAQ open could be either. Editing changes least, and the switch beside the label is one tap. */
  return { kind: "edit", by: "words" }
}

/**
 * The aim the box shows and sends. A tap wins over the words; "replace" only
 * ever comes from the words (there is no switch for it), and a tap on New
 * section after "turn this into a FAQ" is a new one beside it.
 */
export function resolveAim(input: { prompt: string; selected: SelectedShape | null; choice: AimChoice; where?: AimWhere | null }): SectionAim | null {
  const { selected, choice } = input
  const words = readAim(input.prompt, selected)
  if (!selected) {
    if (!words) return null
    const where = input.where === "bottom" || input.where === "top" ? input.where : words.where ?? "top"
    return { ...words, where, index: aimIndex(where, null, 0) }
  }
  if (choice === "edit") return { kind: "edit", by: "choice" }
  if (choice === "new") {
    const where = input.where ?? (words?.kind === "new" ? words.where : undefined) ?? "below"
    return { kind: "new", by: "choice", where, index: aimIndex(where, selected, selected.total), named: words?.named }
  }
  if (words?.kind === "new" && input.where) return { ...words, where: input.where, index: aimIndex(input.where, selected, selected.total) }
  return words ?? { kind: "edit", by: "words" }
}

/** The place, in words, for the label: "below Hero", "at the top of the page". */
export function placeWords(where: AimWhere | undefined, name: string | null): string {
  if (where === "top") return "at the top of the page"
  if (where === "bottom") return "at the end of the page"
  if (!name) return "at the top of the page"
  return where === "above" ? `above ${name}` : `below ${name}`
}

/** What the box says Enter will do. Copy kept plain: no AI words, no dashes. */
export function aimLabel(aim: SectionAim | null, name: string | null): { lead: string; subject: string } | null {
  if (!aim) return null
  if (aim.kind === "edit") return name ? { lead: "Editing:", subject: name } : null
  if (aim.kind === "replace") return { lead: "Replacing:", subject: name ?? "this section" }
  return { lead: "New section", subject: placeWords(aim.where, name) }
}

/** What the request carries: the same as the label. */
export interface AimWire {
  kind: AimKind
  by: "words" | "choice"
  index?: number
  where?: AimWhere
}

export function aimWire(aim: SectionAim | null): AimWire | undefined {
  if (!aim) return undefined
  return { kind: aim.kind, by: aim.by, ...(aim.index != null ? { index: aim.index } : {}), ...(aim.where ? { where: aim.where } : {}) }
}

/**
 * Where the section writer puts a new one, for ai-placement's writingAnchor:
 * beside the open section, or at an end of the page.
 */
export interface WriterPlace {
  selectedId?: string
  near?: "after" | "before"
  end?: "top" | "bottom"
}

export function writerPlace(aim: SectionAim | null, selectedId: string | null | undefined): WriterPlace | undefined {
  if (!aim || aim.kind !== "new") return undefined
  if (aim.where === "top" || aim.where === "bottom") return { end: aim.where }
  if (!selectedId) return undefined
  return { selectedId, near: aim.where === "above" ? "before" : "after" }
}

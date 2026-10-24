/**
 * ===========================================================================
 *  A SECTION IS SELECTED. IS THE REQUEST ABOUT IT?
 * ===========================================================================
 * Somebody with the hero open types "add a testimonials section below this".
 * The run was told the open section is the subject of everything, and edited
 * the hero: a testimonial squeezed into its subheading. Having a section open
 * is where they are on the page, not always what they are asking about.
 *
 * So the words decide, in code, before the model reads the page:
 *
 *   edit      the open section is the subject ("make this bolder", "add a
 *             button", "add two more questions")
 *   new       a new section is asked for ("add a pricing section below",
 *             "I need another section with a map"), placed beside the open
 *             one unless the words say where
 *   replace   the open section is to become a different one ("turn this into
 *             a FAQ", "replace this with a gallery"), in its place
 *   ask       truly either: "add testimonials" with a FAQ open could be new
 *             entries or a new section. One short question, two answers.
 *
 * Errs toward `edit`, the reading that changes least. Pure: tested in
 * tests/round-bc-aiagent.test.ts.
 */

export type SelectionAim = "edit" | "new" | "replace" | "ask"

export interface SelectionRead {
  aim: SelectionAim
  /** Where a new section goes, as add_section's index: beside the open one unless the words say otherwise. */
  index?: number
  /** The kind of section the words name, when they name one: "testimonials". */
  named?: string
  reason: string
}

export interface SelectedShape {
  id: string
  type: string
  name: string
  /** Its position in the page's section list, header included. */
  position: number
  /** How many sections the page has, header and footer included. */
  total: number
  /** The block types it takes, so "add two more questions" to a FAQ is about its entries. */
  blockTypes?: string[]
}

/* What a section is, by the words people use for one. Kept to section-sized things: a button or a heading is not here. */
const KINDS = String.raw`(?:hero|banner|faqs?|questions section|pricing(?: table)?|plans|gallery|testimonials?|reviews?|features?|newsletter|sign ?up|email capture|cta|call to action|about(?: us)?|contact(?: form)?|map|product (?:grid|list|carousel)|products|collections?|events?|schedule|countdown|timer|slideshow|slider|carousel|video|team|stats|numbers|logos?(?: wall| strip| cloud)?|timeline|steps|how it works|comparison|story|lookbook|marquee|ticker|announcement(?: bar)?|image with text|rich text|columns|multicolumn)`

const SECTION_WORD = String.raw`(?:section|band|strip|area|row|part of the page|block on the page)`

/* "A new section", "another band", "one more section with ...". */
const NEW_WORDS = new RegExp(String.raw`\b(?:new|another|separate|extra|second|additional|one more|a fresh)\s+(?:[a-z-]+\s+){0,3}${SECTION_WORD}\b`, "i")
/* "Add a pricing section", "create a section for events", "I need a FAQ section". */
const ADD_A_SECTION = new RegExp(String.raw`\b(?:add|insert|put|create|build|make|give me|i (?:need|want)|we (?:need|want)|include)\b[^.?!]{0,40}\b(?:an?|another|new|some|one)\b[^.?!]{0,40}\b${SECTION_WORD}\b(?!\s*settings?)`, "i")
/* "Add testimonials", "add a FAQ": a kind of section named, without the word. */
const ADD_A_KIND = new RegExp(String.raw`\b(?:add|insert|put|include|create|build|i (?:need|want)|we (?:need|want))\b\s+(?:an?\s+|some\s+|the\s+|my\s+)?(?:[a-z-]+\s+){0,2}?(${KINDS})\b`, "i")
/* Where, in words. */
const ABOVE = /\b(?:above|before|on top of|over)\s+(?:this|it|the selected|that)\b|\bat the (?:very )?top\b/i
const BELOW = /\b(?:below|after|under|beneath|underneath|following)\s+(?:this|it|the selected|that)\b|\bnext to (?:this|it)\b/i
const TOP = /\bat the (?:very )?top(?: of the page)?\b/i
const BOTTOM = /\bat the (?:very )?(?:bottom|end)(?: of the page)?\b|\babove the footer\b/i
/* "Turn this into a FAQ", "replace this with a gallery", "swap it for a slideshow", "change this to a pricing table". */
const REPLACE = new RegExp(String.raw`\b(?:replace|swap|switch)\s+(?:this|it|the selected(?: section)?|this section|this one)\s+(?:with|for|out for)\b|\b(?:turn|convert|change|make)\s+(?:this|it|this section|this one|the selected(?: section)?)\s+(?:in)?to\s+(?:an?|the)?\s*(?:[a-z-]+\s+){0,2}(?:${KINDS}|${SECTION_WORD})\b`, "i")
/* The open section, said: "to this", "in it", "here", "this section's". */
const ABOUT_IT = /\b(?:to|in|into|inside|on|within|for)\s+(?:this|it|here|the selected|this section|this one)\b|\bthis section'?s?\b(?!\s+(?:below|above))|\bhere\b/i

function kindOf(type: string, name: string): string {
  return `${type} ${name}`.toLowerCase().replace(/[_-]+/g, " ")
}

/** Whether the named kind is what the open section already is, or what its blocks are: "testimonial" in a testimonials section. */
function alreadyIs(named: string, selected: SelectedShape): boolean {
  const stem = named.toLowerCase().replace(/\b(section|table|form|wall|strip|cloud|bar)\b/g, "").trim().replace(/s$/, "").replace(/ies$/, "y")
  if (!stem) return false
  const head = stem.split(/\s+/)[0]
  if (kindOf(selected.type, selected.name).includes(head)) return true
  if (head === "faq" || head === "question") return /faq|question/.test(kindOf(selected.type, selected.name)) || (selected.blockTypes ?? []).some((b) => /faq|question/.test(b))
  return (selected.blockTypes ?? []).some((b) => b.toLowerCase().replace(/[_-]+/g, " ").includes(head))
}

function placed(text: string, selected: SelectedShape): number {
  if (TOP.test(text) && !ABOVE.test(text.replace(TOP, ""))) return 1
  if (BOTTOM.test(text)) return Math.max(1, selected.total - 1)
  if (ABOVE.test(text)) return selected.position
  return selected.position + 1
}

export function readSelection(prompt: string, selected: SelectedShape): SelectionRead {
  const text = prompt.replace(/\s+/g, " ").trim()
  if (!text) return { aim: "edit", reason: "no words" }

  const replaced = REPLACE.exec(text)
  if (replaced) {
    const named = text.slice(replaced.index).match(new RegExp(KINDS, "i"))?.[0]
    return { aim: "replace", index: selected.position, named, reason: "the open section is to become another" }
  }

  const where = ABOVE.test(text) || BELOW.test(text) || TOP.test(text) || BOTTOM.test(text)
  if (NEW_WORDS.test(text) || (ADD_A_SECTION.test(text) && (where || !ABOUT_IT.test(text)))) {
    const named = text.match(new RegExp(KINDS, "i"))?.[0]
    return { aim: "new", index: placed(text, selected), named, reason: "a new section asked for" }
  }

  const kind = ADD_A_KIND.exec(text)
  if (kind) {
    const named = kind[1]
    if (ABOUT_IT.test(text) && !where) return { aim: "edit", named, reason: "named, but into the open section" }
    if (alreadyIs(named, selected)) return { aim: "edit", named, reason: "more of what the open section already holds" }
    if (where) return { aim: "new", index: placed(text, selected), named, reason: "a kind of section, placed in words" }
    /* The open section takes entries of its own, and this could be more of them or a section of its own: that is the one real doubt. */
    if ((selected.blockTypes ?? []).length > 0) return { aim: "ask", index: placed(text, selected), named, reason: "either a new section or entries in the open one" }
    return { aim: "new", index: placed(text, selected), named, reason: "a kind of section the open one cannot hold" }
  }

  return { aim: "edit", reason: "about the open section" }
}

/** What the model reads about the open section, for each reading. `describe` is the section as the page holds it. */
export function selectionGuidance(read: SelectionRead, selected: SelectedShape, describe: string): string {
  const label = `${selected.name} [${selected.id}]`
  switch (read.aim) {
    case "new":
      return `THE CREATOR HAS ${label} SELECTED, BUT THIS REQUEST IS FOR A NEW SECTION${read.named ? ` (${read.named})` : ""}. This overrides the rule that the selected section is edited in place: do not change ${label}. Add the new section with add_section or create_section at index ${read.index} (${read.index === selected.position ? "just above" : read.index === selected.position + 1 ? "just below" : "where the words say, not beside"} the selected one), fill it completely, and make it sit well beside its neighbours: alternate its colour scheme with the section above it and keep the page's spacing.\n\nThe selected section, for reference only:\n${describe}`
    case "replace":
      return `THE CREATOR HAS ${label} SELECTED AND WANTS IT REPLACED${read.named ? ` by ${read.named}` : ""}, which overrides editing it in place. Put the new section at index ${read.index} (where the selected one is), carry over its real content that still fits (headings, links, pictures, the facts), fill the new one completely, then remove ${label}. Say in your reply that it was replaced.\n\n${describe}`
    case "ask":
      return `THE CREATOR HAS ${label} SELECTED, AND "${read.named}" COULD MEAN TWO THINGS: more entries inside ${label}, or a new ${read.named} section beside it. Before any change, call ask_creator once with the question "Add ${read.named} inside ${selected.name}, or as a new section?" and the two choices "Inside ${selected.name}" and "As a new section". Change nothing until they answer.\n\n${describe}`
    default:
      return `THE CREATOR HAS THIS SECTION SELECTED AND OPEN. "this section", "this", "it" and "here" all mean THIS one unless they clearly name another. A change they ask for is a change to THIS section, not a new section.\n\n${describe}`
  }
}

/** The open section as `readSelection` reads it, from the page's sections; null when the id is not on the page. */
export function selectedShapeOf(
  sections: { id: string; type: string; name?: string | null; blocks?: { type: string }[] | null }[],
  id: string | null | undefined,
  schemaBlocks?: (type: string) => string[],
): SelectedShape | null {
  if (!id) return null
  const position = sections.findIndex((s) => s.id === id)
  if (position < 0) return null
  const section = sections[position]
  const blockTypes = [...new Set([...(schemaBlocks?.(section.type) ?? []), ...(section.blocks ?? []).map((b) => b.type)])]
  return { id, type: section.type, name: section.name?.trim() || section.type.replace(/[_-]+/g, " "), position, total: sections.length, blockTypes }
}

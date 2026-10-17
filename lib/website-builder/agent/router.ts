/**
 * ===========================================================================
 *  WHICH AGENT ANSWERS, DECIDED ON THE SERVER
 * ===========================================================================
 * Ask Storelib is one assistant with no modes. Behind it are two agents:
 *
 *   PAGE     the page assistant (./loop.ts) with its tools: it edits the page,
 *            its sections' settings, blocks and content, adds sections the
 *            theme has, builds other pages, changes the theme, and with
 *            `codeFocus` rewrites the selected section's own code.
 *   WRITER   the section writer (./write-section.ts): one brand new kind of
 *            section, planned, written, compiled, drawn and read back.
 *
 * The browser used to pick between them from a switch ("Code section" or
 * "Change page") and a wording rule. Now it sends the words, the selection
 * and whether the "Editing: <Name>" chip is on, and this decides, per
 * request:
 *
 *   1. RULES FIRST. The selection, the chip, the words that widen the scope
 *      ("now do the whole page"), the words that ask for a section of its
 *      own, a picture to copy, and the request's kind (./intent.ts).
 *   2. A SMALL FAST MODEL only when the rules cannot tell: "add a before and
 *      after slider" with nothing selected could be a section the theme has
 *      or a new one. Injected (`classify`), so this file stays pure and the
 *      tests run it without a network; without one the rules' default holds.
 *
 * The target is how far the change reaches: an element, a block, a section,
 * the page, or the whole theme. Widening needs no confirmation: "now do the
 * whole page" with the chip on is the whole page.
 */

import { classifyIntent } from "./intent"

export type RouteAgent = "page" | "writer"
export type RouteTarget = "element" | "block" | "section" | "page" | "theme"

export interface RouteSelection {
  sectionId: string
  sectionType?: string
  sectionName?: string
  /** A block inside it, by its path key (lib/website-builder/block-tree.ts). */
  blockId?: string | null
  blockType?: string | null
  /** Whose code the section is (./selected-section.ts): only "own" and "builtin" have a file to edit. */
  origin?: "own" | "builtin" | "product" | "chrome"
}

export interface RouteInput {
  prompt: string
  /** How many pictures came with it. */
  images: number
  selection: RouteSelection | null
  /** The "Editing: <Name>" chip is on: the request is about the selection unless the words widen it. */
  scoped: boolean
  /** Sections on the page other than the header and footer. */
  bodySections: number
  /** Kinds of section the theme already has, by type and name, so "add a FAQ" is not a new one. */
  addable?: { type: string; name?: string }[]
  hasHistory?: boolean
}

export interface RouteDecision {
  agent: RouteAgent
  target: RouteTarget
  /** Only the selection may change. */
  lock: boolean
  /** The change goes into the selected section's own code. */
  codeFocus: boolean
  by: "rules" | "model"
  /** Why, in a few words: logged, never shown. */
  reason: string
}

/** The rules' answer, and whether a model should be asked. */
export interface RuleDecision extends RouteDecision {
  ambiguous: boolean
}

/** Asked only when the rules cannot tell. Null is "do not know": the rules' default holds. */
export type RouteClassifier = (prompt: string, ctx: { addable: string[] }) => Promise<RouteAgent | null>

const text = (s: string) => s.replace(/\s+/g, " ").trim()

/** A section of its own: "add a new section", "build me a section like this image", "a section with a flag". */
const NEW_SECTION =
  /\b(new|another|extra|second)\s+section\b|\b(add|create|build|make|write|design|code|copy|recreate|replicate|clone)\b(\s+me)?\s+(a|an|one|this|that|the)?\s*[^.?!]{0,40}\bsection\b|^\s*(a|an)\b[^.?!]{0,80}\bsection\b|\bsection\s+(like|from)\s+(this|the|my)\s+(image|picture|screenshot|photo)\b/i

/** The page, not the selection: "now do the whole page", "every section", "the rest of the page". */
const WIDEN_PAGE =
  /\b(?:whole|entire|full|rest of the|the rest of this)\s+page\b|\b(?:all|every)\s+(?:the\s+)?sections?\b|\beverything\s+(?:on|in)\s+(?:the|this)\s+page\b|\b(?:do|apply|same|now)\b[^.?!]{0,20}\b(?:everywhere on the page|to the rest|to everything|to all of them|the others)\b|\b(?:other|rest of the)\s+sections\b/i

/** The theme, not the page: "the whole site", "every page", "site wide", "the theme's fonts". */
const WIDEN_SITE =
  /\b(?:whole|entire|full)\s+(?:web ?site|site|store|shop|theme)\b|\b(?:all|every)\s+(?:the\s+)?pages\b|\bevery page\b|\bsite.?wide\b|\beverywhere\b|\bglobal(?:ly)?\b|\btheme settings\b|\b(?:the|my)\s+theme\b|\bacross (?:the|my) (?:site|website|store)\b/i

/** A picture to copy as a section: "like this", "recreate this", or nothing typed at all. */
const COPY_PICTURE = /\b(like this|this one|recreate|replicate|clone|copy|same as|match|exactly|1:1|from (?:this|my|the) (?:screenshot|image|picture|design|mockup))\b/i

/** Words that are about how a section is built or behaves, which lives in its code. */
const CODE_SHAPED =
  /\b(animat\w*|motion|transition\w*|hover\w*|scroll\w*|parallax|slide\w*|slider|carousel|marquee|ticker|countdown|timer|accordion|tabs?|sticky|interactive|interaction\w*|autoplay|fade\w*|reveal\w*|layout|columns?|grid|structure|rebuild|redesign|from scratch|completely|totally|code|css|html|script|javascript|js|responsive|mobile layout|markup|template)\b/i

/** Words that are only about content or a setting: the page assistant edits those without touching code. */
const SETTING_SHAPED =
  /\b(text|copy|heading|headline|title|subtitle|wording|rewrite|reword|tagline|paragraph|price|prices|image|photo|picture|logo|link|button (?:text|label)|colou?rs?|background|font|spacing|padding|bigger|smaller|darker|lighter|hide|show|remove|delete)\b/i

/** "Add a before and after slider": a thing to add, with no word saying which kind of thing. */
const ADD_THING = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:add|create|build|make|design|code|write|insert|put)\b(?:\s+(?:me|us))?\s+(?:a|an|one|some)\s+([^.?!]{3,80})/i

/** The words name one section: then the request's size does not make it the page or the site. */
const NAMES_A_SECTION = /\b(?:this|that|the|my)\s+(?:selected\s+)?(?:section|hero|banner|faq|pricing|gallery|block|part|one)\b/i

/** Asking for a new kind of section rather than one the theme has. */
const OWN_KIND = /\b(new kind|custom|my own|its own|unique|from scratch|code|coded|like this|from (?:this|the|my) (?:image|picture|screenshot|photo))\b/i

const PAGE_WORDS =/\b(page|pages|site|website|store|shop|home ?page|landing)\b/i

function namesAddable(thing: string, addable: { type: string; name?: string }[]): boolean {
  const said = ` ${thing.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `
  return addable.some((a) => {
    const words = [a.type.replace(/[_-]+/g, " "), a.name ?? ""].map((w) => w.toLowerCase().trim()).filter((w) => w.length >= 3)
    return words.some((w) => said.includes(` ${w} `) || said.includes(` ${w}s `))
  })
}

/**
 * The rules alone. Pure: tests/ask-unified-v.test.ts runs a table of prompts
 * and selections through it.
 */
export function routeByRules(input: RouteInput): RuleDecision {
  const words = text(input.prompt)
  const sel = input.selection
  const scoped = input.scoped && !!sel
  const intent = classifyIntent(words, {
    selected: !!sel,
    locked: false,
    bodySections: input.bodySections,
    images: input.images > 0,
    hasHistory: input.hasHistory,
  })
  const decide = (agent: RouteAgent, target: RouteTarget, lock: boolean, codeFocus: boolean, reason: string, ambiguous = false): RuleDecision => ({
    agent,
    target,
    lock,
    codeFocus,
    by: "rules",
    reason,
    ambiguous,
  })
  const hasFile = !!sel && (sel.origin === "own" || sel.origin === "builtin")
  const sectionTarget: RouteTarget = sel?.blockId ? "block" : "section"

  if (intent.kind === "QUESTION") return decide("page", scoped ? sectionTarget : "page", scoped, false, "a question")

  /*
    Widening wins over the chip: "now do the whole page" means the page, without asking. The request's kind widens too,
    but not one that names a section: "redesign this section from scratch" is that section, however big the words.
  */
  const intentWide = !scoped && !NAMES_A_SECTION.test(words)
  if (WIDEN_SITE.test(words) || (intentWide && (intent.scope === "site" || intent.kind === "FULL_SITE_REDESIGN" || intent.kind === "NEW_SITE_GENERATION"))) {
    return decide("page", "theme", false, false, "the whole site")
  }
  if (WIDEN_PAGE.test(words) || intent.newPage || (intentWide && intent.kind === "PAGE_REDESIGN")) {
    return decide("page", "page", false, false, intent.newPage ? "a new page" : "the whole page")
  }

  /*
    A section of its own, asked for in words, whatever is selected. One the theme already has ("add a testimonials
    section") is the page assistant's, which adds it and fills it, unless the words or a picture ask for a new one.
  */
  /* "Copy this section" is a new one made from it; "make this section red" is the selection. */
  const aboutThisOne = /\b(?:this|that|the selected)\s+section\b/i.test(words.replace(/\b(?:like|from|as)\s+(?:this|that)\s+section\b/gi, "")) && !/\b(?:copy|duplicate|clone|recreate|replicate)\b/i.test(words)
  if (NEW_SECTION.test(words) && !aboutThisOne) {
    const known = !!input.addable && namesAddable(words.replace(/\bsections?\b/gi, ""), input.addable)
    if (known && input.images === 0 && !OWN_KIND.test(words)) return decide("page", "section", false, false, "a section the theme has")
    return decide("writer", "section", false, false, "a section of its own")
  }

  /* A picture and nothing selected: the picture is a section to make. With the chip on, it is what the selection should look like. */
  if (input.images > 0 && !scoped && (!words || COPY_PICTURE.test(words) || intent.recreate)) {
    return decide("writer", "section", false, false, "a picture to make into a section")
  }

  if (scoped && sel) {
    const toCode =
      hasFile &&
      !sel.blockId &&
      (input.images > 0 || CODE_SHAPED.test(words) || intent.kind === "FUNCTIONAL_CHANGE" || intent.kind === "SECTION_REDESIGN" || !!intent.rebuild) &&
      !(SETTING_SHAPED.test(words) && !CODE_SHAPED.test(words) && input.images === 0)
    return decide("page", sectionTarget, true, toCode, toCode ? "the selection's code" : "the selection's settings")
  }

  /* Nothing selected, or the chip cleared: something to add. A kind the theme has is the page assistant's; a new kind is unclear. */
  const thing = ADD_THING.exec(words)?.[1]
  if (thing && !PAGE_WORDS.test(thing) && !(input.addable && namesAddable(thing, input.addable))) {
    return decide("page", "section", false, false, "something to add, of an unknown kind", true)
  }

  if (thing && !PAGE_WORDS.test(thing)) return decide("page", "section", false, false, "a section the theme has")
  const target: RouteTarget = intent.scope === "page" ? "page" : intent.scope === "section" ? "section" : sel ? "page" : "element"
  return decide("page", target, false, false, "a change to the page")
}

/** The rules, then the model when they cannot tell. Never throws: a model that fails leaves the rules' answer. */
export async function routeRequest(input: RouteInput, classify?: RouteClassifier): Promise<RouteDecision> {
  const ruled = routeByRules(input)
  const { ambiguous, ...decision } = ruled
  if (!ambiguous || !classify) return decision
  try {
    const answer = await classify(text(input.prompt), { addable: (input.addable ?? []).map((a) => a.name || a.type).slice(0, 80) })
    if (answer === "writer") return { ...decision, agent: "writer", target: "section", lock: false, codeFocus: false, by: "model", reason: "a new kind of section, by the model" }
    if (answer === "page") return { ...decision, by: "model", reason: "a section the theme has, by the model" }
  } catch {
    /* the rules' answer */
  }
  return decision
}

/** What the small model is asked. One word back. */
export function classifierPrompt(prompt: string, addable: string[]): string {
  return [
    "You route one request in a website editor to one of two agents.",
    "WRITER writes the code for one brand new kind of section that the theme does not have yet.",
    "PAGE edits the page: settings, content, blocks, sections the theme already has, the theme itself.",
    `Sections the theme already has: ${addable.join(", ") || "none listed"}.`,
    `Request: ${prompt.slice(0, 600)}`,
    "Answer with one word: WRITER or PAGE.",
  ].join("\n")
}

/** The model's word, read. Anything else is "do not know". */
export function readClassifierAnswer(said: string): RouteAgent | null {
  const word = said.trim().toUpperCase()
  if (/^WRITER\b/.test(word)) return "writer"
  if (/^PAGE\b/.test(word)) return "page"
  return null
}

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
import { purposeOfWords } from "./purpose-words"

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
  /** The sections already on the page (type and name), so "a new FAQ" beside an existing FAQ is a new one, never that one. */
  onPage?: { type: string; name?: string }[]
  hasHistory?: boolean
  /**
   * ROUND 69: what the box said Enter would do ("Editing: Hero", "New section
   * below Hero", "Replacing: Hero"), from lib/website-builder/section-aim.ts.
   * Honoured: the label the person read is the behaviour.
   */
  aim?: { kind: "edit" | "new" | "replace"; by?: "words" | "choice" }
  /**
   * ROUND 69: a site made from one of Storelib's templates (Materia): the
   * purposes its own Materia sections cover. A new section for one of these
   * is a Materia section, chosen and filled by the page assistant, not a new
   * file written from nothing.
   */
  materiaPurposes?: string[]
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

/*
  THE MODEL IS ASKED AT MOST SO OFTEN (round AW). The decide route
  (app/api/website-builder/themes/[installId]/agent/decide) was the one route
  that starts a model call of its own with no limit at all: it is asked
  before every Ask Storelib message, writes nothing, and a request the rules
  cannot place ("add a <thing the theme has no section for>") is a paid call
  (./router-model.ts), so a script could ask it as fast as it liked. Over the
  limit the rules answer alone, which is what a model that did not answer in
  four seconds already means: the person never sees a refusal. Per store,
  far above anybody typing.
*/
export const ROUTER_MODEL_LIMITS = [
  { limit: 30, seconds: 60 },
  { limit: 300, seconds: 3600 },
] as const

/** The classifier, asked only when `may` says this one is within the limit; otherwise "do not know", and the rules decide. */
export function limitedClassifier(classify: RouteClassifier, may: () => Promise<boolean>): RouteClassifier {
  return async (prompt, ctx) => ((await may()) ? classify(prompt, ctx) : null)
}

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

/** A link in the site's menu, added, removed, renamed or moved: Website settings, Navigation, not a section. */
const MENU_EDIT =
  /\b(?:add|remove|delete|rename|move|reorder|take out|put|link)\b[^.?!]{0,50}\b(?:to|in|into|from|on|of)\s+(?:the\s+|my\s+|our\s+)?(?:main\s+|top\s+|footer\s+|header\s+)?(?:menu|navigation|nav(?:bar)?|nav bar)\b/i

/** Round AK: "new", "another", "a second": a section that is not the one already there. */
const NEW_WORDS = /\b(new|another|extra|second|separate|additional|fresh)\b/i

/** "Something completely different", "a different design", "not like my current one": never an edit of what is there. */
const DIFFERENT = /\b(?:completely|totally|entirely|something|very)\s+(?:different|new|else|unique|original)\b|\bdifferent\s+(?:design|style|look|layout|one|version|kind)\b|\bnot\s+like\s+(?:the|my|this)\s+(?:existing|current|old|other)\b|\bnot\s+(?:the|my)\s+(?:existing|current|old)\b/i

/**
 * THE WORDS NAME ANOTHER SECTION ON THE PAGE. A section left selected by
 * mistake took every edit: the hero open, "make the FAQ shorter" typed, and
 * the hero was changed. "The FAQ", "my footer", "the testimonials": a section
 * that is on the page and is not the selected one, said with "the", "my",
 * "our" or "that" before it, so a word in passing ("text", "image") never
 * counts.
 */
export function namesAnotherSection(words: string, sel: RouteSelection, onPage: { type: string; name?: string }[] = []): boolean {
  const norm = (w: string) => w.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
  const mine = new Set([sel.sectionType, sel.sectionName].filter(Boolean).map((w) => norm(w as string)))
  const said = ` ${norm(words)} `
  /* Saying the selection itself ("this section", its own name) keeps it. */
  if (/ (?:this|the selected) (?:section|one|block) /.test(said)) return false
  for (const w of mine) if (w.length >= 3 && said.includes(` ${w} `)) return false
  const others = new Set<string>()
  for (const s of onPage) {
    for (const w of [s.type, s.name ?? ""].map(norm)) if (w.length >= 3 && !mine.has(w)) others.add(w)
  }
  for (const w of ["header", "footer", "announcement bar", "menu"]) if (!mine.has(w) && ![...mine].some((m) => m.includes(w))) others.add(w)
  for (const w of others) {
    const pattern = new RegExp(` (?:the|my|our|that) ${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s? `)
    if (pattern.test(said)) return true
  }
  return false
}

function namesAddable(thing: string, addable: { type: string; name?: string }[]): boolean {
  const said = ` ${thing.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `
  return addable.some((a) => {
    const words = [a.type.replace(/[_-]+/g, " "), a.name ?? ""].map((w) => w.toLowerCase().trim()).filter((w) => w.length >= 3)
    return words.some((w) => said.includes(` ${w} `) || said.includes(` ${w}s `))
  })
}

/**
 * A NEW SECTION: the page assistant when the theme already has one for the job (it adds it and fills it), the
 * section writer for a kind of its own. On a Materia site the job is read by purpose, so "a newsletter signup" is
 * one of Materia's signup sections in the page's own style, not a file written from nothing (round 69).
 */
function newSection(input: RouteInput, words: string, reason: string): RuleDecision {
  const said = words.replace(/\bsections?\b/gi, "")
  const known = (!!input.addable && namesAddable(said, input.addable)) || materiaHas(words, input.materiaPurposes)
  const own = input.images > 0 || OWN_KIND.test(words) || DIFFERENT.test(words)
  const base = { target: "section" as const, lock: false, codeFocus: false, by: "rules" as const, ambiguous: false }
  if (known && !own) return { ...base, agent: "page", reason: `${reason}: a kind the theme has` }
  return { ...base, agent: "writer", reason: `${reason}: a kind of its own` }
}

/** The words ask for a job one of the site's Materia sections does. */
export function materiaHas(words: string, purposes: string[] | undefined): boolean {
  if (!purposes?.length) return false
  const purpose = purposeOfWords(words)
  return !!purpose && purposes.includes(purpose)
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
  /*
    THE SITE'S MENU IS NOT THE OPEN SECTION. "Add a Pricing link to the main menu" with the hero open was locked to the
    hero, and every menu edit was refused. Links in a menu live in the site's navigation, whatever is selected.
  */
  if (MENU_EDIT.test(words)) return decide("page", "theme", false, false, "the site's menu")

  /* Another section named while one is selected: that one is meant, never the selection (a selection left on by mistake). */
  if (scoped && sel && namesAnotherSection(words, sel, input.onPage)) return decide("page", "page", false, false, "another section, by name")

  /*
    THE PANEL OF THE OPEN SECTION: "rearrange this section's settings", "group the controls". Its <schema>, so its code
    when it has a file, and only it.
  */
  if (scoped && sel && intent.settingsLayout) return decide("page", sectionTarget, true, hasFile, "the selection's settings panel")

  /*
    ROUND 69: THE BOX SAID WHAT ENTER DOES, AND IT IS DONE. "New section below Hero" is never written into the hero;
    "Editing: Hero" never becomes a new section; "Replacing: Hero" puts a new one in its place. The lock is off for a
    new one or a replacement, so the page assistant may add it, and on for an edit.
  */
  if (sel && input.aim?.kind === "replace") return decide("page", "section", false, false, "the open section, replaced")
  if (input.aim?.kind === "new") return newSection(input, words, "a new section, as the box said")
  if (scoped && sel && input.aim?.kind === "edit") {
    const toCode = hasFile && !sel.blockId && (input.images > 0 || CODE_SHAPED.test(words) || intent.kind === "FUNCTIONAL_CHANGE" || intent.kind === "SECTION_REDESIGN" || !!intent.rebuild) && !(SETTING_SHAPED.test(words) && !CODE_SHAPED.test(words) && input.images === 0)
    return decide("page", sectionTarget, true, toCode, "the open section, as the box said")
  }

  /* "Copy this section" is a new one made from it; "make this section red" is the selection; "a new section below this section" is a new one placed by it. */
  const aboutThisOne = /\b(?:this|that|the selected)\s+section\b/i.test(words.replace(/\b(?:like|from|as|below|above|after|before|under|beneath|over|next to|beside)\s+(?:this|that|the selected)\s+(?:section|one)\b/gi, "")) && !/\b(?:copy|duplicate|clone|recreate|replicate)\b/i.test(words)
  if (NEW_SECTION.test(words) && !aboutThisOne) {
    const said = words.replace(/\bsections?\b/gi, "")
    const known = (!!input.addable && namesAddable(said, input.addable)) || materiaHas(words, input.materiaPurposes)
    /*
      Round AK, the owner: "create a new FAQ section, something completely
      different" was routed as "a section the theme has" because the theme
      has a FAQ, and the page assistant rewrote the FAQ already on the page.
      A new one of a kind already on this page, or one asked to be
      different, is a section of its own, written fresh and placed as a new
      section; the one on the page is left alone.
    */
    const alreadyHere = !!input.onPage && NEW_WORDS.test(words) && namesAddable(said, input.onPage)
    if (known && input.images === 0 && !OWN_KIND.test(words) && !DIFFERENT.test(words) && !alreadyHere) return decide("page", "section", false, false, "a section the theme has")
    return decide("writer", "section", false, false, alreadyHere ? "a new one beside the one on the page" : "a section of its own")
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

/**
 * ===========================================================================
 *  WHAT KIND OF CHANGE THIS IS, DECIDED BEFORE THE MODEL SEES THE PAGE
 * ===========================================================================
 * "Make this whole website into a complete smooth modern interactive website
 * for Bandidos, a bachata club" came back as the same page with a new hero
 * colour. The model was shown the page first and the request last, and every
 * rule it had said preserve: change as little as possible, keep what is
 * there, stay on the subject. Those rules are right for "make that button
 * bigger" and exactly wrong for a new creative direction.
 *
 * So the request is classified first, in code, and the run is told which
 * kind it is and what that kind permits:
 *
 *   LOCAL_EDIT            one thing, everything else untouched
 *   CONTENT_CHANGE        the words, pictures or entries
 *   STYLE_CHANGE          how it looks at rest
 *   FUNCTIONAL_CHANGE     how it behaves: motion, interaction, a countdown
 *   SECTION_REDESIGN      one section rethought, the rest kept
 *   PAGE_REDESIGN         this page rethought, other pages and the theme kept
 *   FULL_SITE_REDESIGN    a new creative direction for the whole site
 *   NEW_SITE_GENERATION   a site built from a brief, the current one is not a constraint
 *   QUESTION              an answer, no change
 *
 * The labels are internal. The creator never sees them; the model reads what
 * each one means for this run (`intentGuidance`), and the loop uses them to
 * decide whether a creative plan is made first and how the final check judges
 * the result (./project-check.ts).
 *
 * DETERMINISTIC. A regex cannot read every sentence, so the classifier errs
 * toward the reading that does less damage: a request it is unsure of is a
 * local edit, which preserves work, never a redesign, which replaces it. The
 * one exception is a page with almost nothing on it, where "build me a site"
 * has nothing to lose.
 *
 * Pure, no imports beyond types: tests/agent-intent.test.ts runs every
 * phrasing below through it.
 */

export type IntentKind =
  | "LOCAL_EDIT"
  | "CONTENT_CHANGE"
  | "STYLE_CHANGE"
  | "FUNCTIONAL_CHANGE"
  | "SECTION_REDESIGN"
  | "PAGE_REDESIGN"
  | "FULL_SITE_REDESIGN"
  | "NEW_SITE_GENERATION"
  | "QUESTION"

export interface Intent {
  kind: IntentKind
  /** Other kinds the same request also is: "make the events section aggressive and add a countdown" is a redesign and a behaviour change. */
  also: IntentKind[]
  /** How far the change reaches. */
  scope: "element" | "section" | "page" | "site"
  /** Whether a creative plan is made before anything is built (./creative-plan.ts). */
  plan: boolean
  /** Whether the existing structure is a constraint. False only for the three big kinds. */
  preserveStructure: boolean
  /** A short message about the run before it: "make that bigger", "undo that". */
  followUp: boolean
  /** The request asks for motion or interaction as a requirement, not a nicety. */
  wantsMotion: boolean
  /** Why, in a few words each: logged, never shown. */
  reasons: string[]
  /**
   * THE THING NAMED IS TO BE MADE AGAIN, NOT ADJUSTED: "completely redesign
   * the FAQ", "make the FAQ totally different, much more modern", "remake the
   * hero from scratch". A section built new (its own file, layout, controls),
   * not the old one's settings moved. Absent on older callers: false.
   */
  rebuild?: boolean
  /** A light touch asked for: "a bit", "slightly", "a little". The section and its content stay; its look moves. */
  light?: boolean
  /** A new page asked for: "add an About page", "build another landing page". Built with build_page, then linked. */
  newPage?: boolean
  /** What the creator said to leave alone: "keep the header", "don't touch the pricing". */
  keep?: string[]
  /** A value every page reads (the logo, the store name, the socials), to be changed once where it lives. */
  global?: boolean
  /** A picture came with it and the words ask for the page to look like it: measured against it (./reference-diff.ts). */
  recreate?: boolean
}

export interface IntentContext {
  /** A section is open in the editor. */
  selected?: boolean
  /** That section is the only thing that may change. */
  locked?: boolean
  /** The creator chose Code a section. */
  codeFocus?: boolean
  /** Sections on the page other than the header and footer, visible or not. */
  bodySections?: number
  /** A picture came with the request. */
  images?: boolean
  /** The conversation has messages before this one. */
  hasHistory?: boolean
}

const SITE = String.raw`(?:web ?site|site|home ?page|landing ?page|store ?front|online store|shop)`
/** The whole site, as against one page of it. */
const WHOLE = String.raw`(?:web ?site|site|store ?front|online store)`
const BUILD = String.raw`(?:build|create|make|generate|design|set up|start|give me|i want|i need|we need)`

/** A whole new site from a brief. */
const NEW_SITE = [
  new RegExp(String.raw`\b${BUILD}\b[^.?!]{0,60}\b(?:an?|my|our|the)?\s*(?:new|complete|full|whole|entire|brand new|premium|modern|beautiful|professional|proper|real|stunning|[a-z]+)?[^.?!]{0,40}\b${SITE}\b[^.?!]{0,20}\b(?:for|about|selling|to sell|that sells)\b`, "i"),
  new RegExp(String.raw`\b${BUILD}\b[^.?!]{0,30}\b(?:an?|my|our|the)?\s*(?:new|complete|full|whole|entire|brand new)\s+(?:[a-z]+\s+){0,2}${WHOLE}\b`, "i"),
  /* "make me a clothing brand website", "i want a skincare store", "give me an online shop for my candles" */
  /\b(?:build|create|make|design|generate|give|set up|launch)\b(?: me| us)?\s+(?:an?|my own|our own|a whole|a full|a complete|a new)\b[^.?!]{0,50}\b(?:web ?site|site|online store|store ?front|e-?commerce (?:site|store)|store|shop)\b(?!\s*(?:section|page|button|link|heading|grid|block))/i,
  /\b(?:i|we)\s+(?:want|need|would like)\b[^.?!]{0,12}\b(?:an?|my own|our own)\b[^.?!]{0,50}\b(?:web ?site|site|online store|store ?front|store|shop)\b(?!\s*(?:section|page|button|link|heading|grid|block))/i,
  /\bturn\s+(?:this|it|my (?:web ?)?site|the (?:web ?)?site|my store|everything)\s+into\s+an?\b/i,
  /\b(from scratch|start (?:over|again|fresh)|scrap (?:it|this|everything)|throw (?:it|this|everything) (?:away|out)|brand new (?:web ?)?site|new website)\b/i,
]

/** A new direction for what is already there, across the site. */
const FULL_SITE = [
  new RegExp(String.raw`\b(?:redesign|rebuild|remake|revamp|overhaul|rethink|redo|rework|restyle)\b[^.?!]{0,30}\b(?:everything|the (?:whole|entire) (?:thing|${WHOLE})|(?:my|our|the|this) ${WHOLE}|whole ${WHOLE}|entire ${WHOLE})`, "i"),
  new RegExp(String.raw`\b(?:make|turn|change|convert)\b[^.?!]{0,20}\b(?:this|the|my|our)?\s*(?:whole|entire|complete|full)\s+${WHOLE}\b[^.?!]{0,12}\b(?:into|look|looks|feel|feels|like|an?)\b`, "i"),
  new RegExp(String.raw`\b(?:make|turn)\b[^.?!]{0,30}\b(?:it|this|the ${SITE}|my ${SITE}|everything)\b[^.?!]{0,20}\b(?:look|feel)s? like (?:an?|the)?\s*(?:real|proper|premium|luxury|high.?end|professional|actual)\b`, "i"),
  /\b(rebrand|new (?:creative )?direction|completely different|totally different|different vibe|whole (?:new )?(?:look|vibe|feel|style|aesthetic)|change (?:the )?(?:whole|entire) (?:look|vibe|feel|style|aesthetic|design))\b/i,
  new RegExp(String.raw`\b(?:redesign|rebuild|restyle)\b[^.?!]{0,10}\b(?:it|this)\b[^.?!]{0,30}\b(?:as|into|like) (?:an?|the)\b[^.?!]{0,40}\b${SITE}\b`, "i"),
]

/** This page, rethought. */
const PAGE = [
  /\b(?:redesign|rebuild|remake|revamp|overhaul|rethink|redo|rework|restructure)\b[^.?!]{0,20}\b(?:this|the|my) (?:page|home ?page|landing ?page|layout)\b/i,
  /\b(?:make|turn)\b[^.?!]{0,20}\b(?:this|the|my) (?:whole |entire )?(?:page|home ?page|landing ?page)\b[^.?!]{0,30}\b(?:better|premium|professional|modern|look)\b/i,
  /\b(?:whole|entire|full) page\b/i,
]

/** One section, rethought. */
const SECTION = [
  /\b(?:make|turn|give)\b[^.?!]{0,30}\b(?:this|that|the|my)\b[^.?!]{0,25}\b(?:section|hero|banner|faq|pricing|gallery|footer|header|nav(?:igation)?|menu|events?|testimonials?|features?|part|one)\b[^.?!]{0,30}\b(?:completely|totally|entirely|something) (?:different|new|else)\b/i,
  /\b(?:redesign|rebuild|remake|revamp|rethink|redo|rework|reimagine)\b[^.?!]{0,30}\b(?:this|that|the|my)\b[^.?!]{0,25}\b(?:section|hero|header|banner|faq|pricing|gallery|footer|events?|testimonials?|features?|block|part)\b/i,
  /\b(?:make|turn)\b[^.?!]{0,30}\b(?:this|that|the|my)\b[^.?!]{0,25}\b(?:section|hero|banner|faq|pricing|gallery|events?( part)?|testimonials?|features?|part|one)\b[^.?!]{0,30}\b(?:better|premium|nicer|stunning|beautiful|more \w+|less \w+|pop|stand out|aggressive|bolder|cleaner|modern|professional|luxur\w+|editorial|interesting)\b/i,
  /\b(?:improve|upgrade|level up|polish)\b[^.?!]{0,20}\b(?:this|that|the)\b[^.?!]{0,20}\b(?:section|hero|part|one)\b/i,
  /^(?:make )?(?:it|this) (?:better|nicer|more premium|look better|pop)\b/i,
]

const MOTION = /\b(animat\w*|motion|smooth\w*|interactive|interaction|parallax|scroll(?:ing)? (?:effect|reveal|animation)s?|reveal|marquee|ticker|carousel|slider|countdown|hover( effect)?|micro.?interactions?|transitions?|fade|sticky|crazy|dynamic|moving|moves?|spin|bounce|cursor|counter|count(?:s|ing)? up|autoplay)\b/i
const FUNCTION = /\b(countdown|timer|slider|carousel|accordion|tabs?|form|sign.?up|subscribe|button that|link to|clickable|toggle|open(?:s)? (?:in|on)|play(?:s)?|video|map|search|filter|sticky|autoplay|interactive)\b/i
const STYLE = /\b(colou?rs?|palette|darker|lighter|dark mode|light mode|font|fonts|typography|type ?face|spacing|padding|margin|bigger|smaller|larger|size|bold(?:er)?|rounded|corners?|shadow|border|background|contrast|align\w*|centr?e(?:d|r)?|width|wider|narrower|tighter|looser|gap|style|look|vibe|minimal|clean(?:er)?|premium|elegant)\b/i
const CONTENT = /\b(text|copy|heading|headline|title|subtitle|words?|wording|rewrite|write|reword|tagline|paragraph|description|question|answer|faq entr\w*|price|prices|name|names|image|images|photo|photos|picture|pictures|logo|link|links|button (?:text|label)|label|testimonial|quote|translate|typo|spelling)\b/i
const ADD_SECTION = /\b(?:add|insert|put|include|create|build|make)\b[^.?!]{0,40}\b(?:section|block|band|strip|row|area|part)\b/i

/**
 * "Make the whole site darker" names the whole site and asks for one change
 * to how it looks. It is a style change everywhere, not a new direction: the
 * sections and their content stay.
 */
const SITE_STYLE = /\b(?:whole|entire|all of the|the|my|this) (?:web ?site|site)\b\s+(?:\w+\s+)?(?:darker|lighter|brighter|warmer|cooler|bolder|softer|calmer|more [a-z]+|less [a-z]+|in [a-z]+|use [a-z]+|with [a-z]+ (?:font|colou?rs?))\b/i
const DIRECTION = /\b(into|look(?:s)? like|feel(?:s)? like|for (?:my|our|a|an|the)|from scratch|new direction|rebrand|redesign|rebuild)\b/i

const QUESTION_START = /^(?:what|why|how|who|where|when|which|can you|could you tell|do you|does|did|is|are|was|will|should i|hi|hello|hey|thanks|thank you)\b/i
const IMPERATIVE = /\b(make|change|add|remove|delete|hide|show|build|create|design|redesign|set|put|move|rewrite|write|fix|update|replace|turn|give)\b/i
const FOLLOW_UP = /^(?:no[, ]|not that|i meant|only|just|undo|revert|go back|put (?:it|that) back|the previous|the old|that one|keep (?:it|that|the)|again|more|less|bigger|smaller|perfect|ok(?:ay)?[, ]|now )/i

/* "Completely", "from scratch", "totally different", "much more modern": the named thing is made again. */
const REBUILD = /\b(complete(?:ly)?|total(?:ly)?|entire(?:ly)?|fully|from scratch|brand new|whole new|all new|remake|rebuild|redo|re-?do|reimagine|start (?:over|again|fresh)|(?:much|way|a lot|far) more (?:modern|premium|clean|cleaner|minimal|editorial|luxur\w*|interactive|professional|beautiful|elegant|stylish)|something (?:completely |totally )?different|(?:completely |totally )?different (?:design|layout|look|style|section|one)|new (?:design|layout|version))\b/i
const LIGHT = /\b(a (?:little|bit|touch|tad)|slightly|a little bit|just a bit|subtly|minor|small tweak|tweak)\b/i
/* "Add an About page", "build another landing page", "I need a size guide page". Not "this page", which is the open one. */
const NEW_PAGE = /\b(?:add|create|build|make|give me|set up|i (?:need|want)|we (?:need|want))\b[^.?!]{0,24}\b(?:an?|another|new|one more|a new|an extra|separate)\b[^.?!]{0,32}\bpages?\b/i
/* "Exactly like this", "1:1", "recreate this", "copy this design": the picture is the target, not a mood. */
const RECREATE = /\b(exact(?:ly)?|1:1|one to one|pixel|recreate|replicate|clone|copy (?:this|it|that|the design|the layout)|match (?:this|it|the|my)|same as (?:this|the)|identical|like (?:this|the|my) (?:screenshot|image|picture|photo|design|mockup|reference)|look(?:s)? like (?:this|it)|make (?:it|this) like this|from (?:this|my|the) (?:screenshot|design|mockup|figma))\b/i
/* "Keep the header", "leave the pricing alone", "don't touch checkout", "without changing the footer". */
const KEEP = /\b(?:keep|leave|preserve|don'?t (?:touch|change|remove|move|edit)|do not (?:touch|change|remove|move|edit)|never (?:touch|change)|without (?:touching|changing|removing))\s+(?:the |my |our |all (?:the |my )?|every |any )?([a-z][a-z0-9 /&'-]{1,40}?)(?=\s*(?:[.,;!?]|$)|\s+(?:as (?:it is|is|they are)|the same|alone|unchanged|intact|exactly|and\b|but\b|while\b|though\b|please\b))/gi
/* A value every page reads, asked to change everywhere at once. */
const GLOBAL = /\b(?:logo|brand ?name|store ?name|shop ?name|site ?name|favicon|social (?:links?|icons?|media)|socials|currency)\b/i
const EVERYWHERE = /\b(everywhere|across (?:the|my|our) (?:whole )?(?:site|website|store)|on (?:every|all) pages?|all (?:the )?pages|site.?wide|globally|in (?:the )?header and (?:the )?footer)\b/i

/** What the creator said to leave alone, as short phrases. */
export function keptPhrases(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(KEEP)) {
    const phrase = m[1].replace(/\s+/g, " ").trim().replace(/\b(it|this|that|them|everything else|the rest|rest)$/i, "").trim()
    if (phrase.length >= 3 && !/^(it|this|that|them|everything|going|in mind|up|on|doing)\b/i.test(phrase) && !out.includes(phrase)) out.push(phrase)
  }
  return out.slice(0, 6)
}

/* A section by what it is, and the site by any word for it: which one a "completely different" is about. */
const NAMES_SECTION = /\b(section|hero|banner|faq|faqs|pricing|gallery|footer|header|nav(?:igation)?|navbar|menu|events?|testimonials?|reviews?|features?|newsletter|cta|call to action|about section|contact section|product grid|slider|carousel|countdown)\b/i
const NAMES_SITE = /\b(web ?site|site|store ?front|online store|shop|everything|whole thing|entire thing|all (?:the )?pages|every page|brand)\b/i

function hits(list: RegExp[], text: string): boolean {
  return list.some((re) => re.test(text))
}

export function classifyIntent(prompt: string, ctx: IntentContext = {}): Intent {
  const text = prompt.replace(/\s+/g, " ").trim()
  const reasons: string[] = []
  const wantsMotion = MOTION.test(text)
  const followUp = !!ctx.hasHistory && text.length < 120 && FOLLOW_UP.test(text)
  const body = ctx.bodySections ?? 0

  const result = (kind: IntentKind, scope: Intent["scope"], also: IntentKind[] = []): Intent => {
    const big = kind === "PAGE_REDESIGN" || kind === "FULL_SITE_REDESIGN" || kind === "NEW_SITE_GENERATION"
    const extra = new Set(also.filter((k) => k !== kind))
    if (wantsMotion && kind !== "FUNCTIONAL_CHANGE" && kind !== "QUESTION") extra.add("FUNCTIONAL_CHANGE")
    const keep = keptPhrases(text)
    const rebuild = REBUILD.test(text) && !LIGHT.test(text) && kind !== "QUESTION"
    return {
      kind,
      also: [...extra],
      scope,
      plan: big,
      preserveStructure: !big,
      followUp,
      wantsMotion,
      reasons,
      rebuild,
      light: LIGHT.test(text) && !rebuild,
      newPage: kind !== "QUESTION" && kind !== "NEW_SITE_GENERATION" && kind !== "FULL_SITE_REDESIGN" && NEW_PAGE.test(text),
      keep,
      global: kind !== "QUESTION" && GLOBAL.test(text) && EVERYWHERE.test(text),
      recreate: !!ctx.images && kind !== "QUESTION" && (RECREATE.test(text) || text.length === 0),
    }
  }

  if (!text && ctx.images) {
    reasons.push("a picture with no words")
    return result(ctx.selected ? "SECTION_REDESIGN" : "LOCAL_EDIT", "section")
  }

  /* A question or a greeting, with nothing to do in it. */
  if ((QUESTION_START.test(text) && /\?\s*$/.test(text) && !/^(can|could) you\b.*\b(make|change|add|build|create|redesign)\b/i.test(text)) || (/^(hi|hello|hey|thanks|thank you)\b/i.test(text) && !IMPERATIVE.test(text))) {
    reasons.push("a question")
    return result("QUESTION", "element")
  }

  /* The lock and Code a section both say: this section and nothing else. */
  if (ctx.locked || ctx.codeFocus) {
    reasons.push(ctx.locked ? "the open section is locked" : "Code a section")
    if (hits(SECTION, text) || /\b(redesign|rebuild|better|premium|from scratch)\b/i.test(text)) return result("SECTION_REDESIGN", "section")
    if (wantsMotion || FUNCTION.test(text)) return result("FUNCTIONAL_CHANGE", "section")
    if (STYLE.test(text) && !CONTENT.test(text)) return result("STYLE_CHANGE", "section")
    if (CONTENT.test(text)) return result("CONTENT_CHANGE", "section")
    return result("LOCAL_EDIT", "section")
  }

  /* Corrections stay what they correct: never promoted to a redesign. */
  if (followUp && !hits(FULL_SITE, text) && !hits(NEW_SITE, text)) {
    reasons.push("a follow up")
    return result(wantsMotion ? "FUNCTIONAL_CHANGE" : "LOCAL_EDIT", ctx.selected ? "section" : "element")
  }

  if (SITE_STYLE.test(text) && !DIRECTION.test(text)) {
    reasons.push("one change to how the whole site looks")
    return result("STYLE_CHANGE", "site")
  }

  if (hits(NEW_SITE, text)) {
    /*
      "Build me a website for my photography course" on a page that already
      has work on it is still a brief for a website: the creator asked for a
      site, not an edit. The difference from a redesign is only what the
      plan may keep, and both start from the brief.
    */
    reasons.push(body <= 1 ? "a site asked for on an empty page" : "a site asked for from a brief")
    return result(body <= 1 ? "NEW_SITE_GENERATION" : "FULL_SITE_REDESIGN", "site")
  }
  /*
    "MAKE THE FAQ COMPLETELY DIFFERENT" NAMES ONE SECTION. "Completely different" is also how a new direction for the
    whole site is said, and read that way it redesigned every page for a request about a FAQ. A section named, with no
    word for the site, is that section rebuilt.
  */
  if (hits(FULL_SITE, text) && NAMES_SECTION.test(text) && !NAMES_SITE.test(text)) {
    reasons.push("one named section, made again")
    return result("SECTION_REDESIGN", "section", FUNCTION.test(text) ? ["FUNCTIONAL_CHANGE"] : [])
  }
  if (hits(FULL_SITE, text)) {
    reasons.push("a new direction for the whole site")
    return result(body <= 1 ? "NEW_SITE_GENERATION" : "FULL_SITE_REDESIGN", "site")
  }
  if (hits(PAGE, text)) {
    reasons.push("this page rethought")
    return result(body <= 1 ? "NEW_SITE_GENERATION" : "PAGE_REDESIGN", "page")
  }
  if (hits(SECTION, text) || (ctx.selected && /\b(better|premium|nicer|redesign|rebuild|improve|stunning|beautiful|professional|modern|more \w+)\b/i.test(text) && text.length < 160)) {
    reasons.push("one section rethought")
    const also: IntentKind[] = FUNCTION.test(text) ? ["FUNCTIONAL_CHANGE"] : []
    return result("SECTION_REDESIGN", "section", also)
  }

  /* Smaller kinds, most specific first. */
  if (ADD_SECTION.test(text)) {
    reasons.push("a section added")
    return result("LOCAL_EDIT", "section", wantsMotion || FUNCTION.test(text) ? ["FUNCTIONAL_CHANGE"] : [])
  }
  if (wantsMotion || FUNCTION.test(text)) {
    reasons.push("behaviour")
    return result("FUNCTIONAL_CHANGE", ctx.selected ? "section" : "element", STYLE.test(text) ? ["STYLE_CHANGE"] : [])
  }
  const siteWide = /\b(whole|entire|every|all (?:the )?(?:pages|sections)|everywhere|site.?wide|the site|the website|globally)\b/i.test(text)
  if (STYLE.test(text) && !CONTENT.test(text)) {
    reasons.push("appearance")
    return result("STYLE_CHANGE", siteWide ? "site" : ctx.selected ? "section" : "element")
  }
  if (CONTENT.test(text)) {
    reasons.push("content")
    return result("CONTENT_CHANGE", ctx.selected ? "section" : "element", STYLE.test(text) ? ["STYLE_CHANGE"] : [])
  }

  /* An empty page and an open ended ask: there is nothing to preserve. */
  if (body <= 1 && /\b(build|create|make|design|generate)\b/i.test(text) && text.length > 25) {
    reasons.push("an open ask on an empty page")
    return result("NEW_SITE_GENERATION", "site")
  }

  reasons.push("nothing more specific")
  return result("LOCAL_EDIT", ctx.selected ? "section" : "element")
}

/**
 * WHAT EACH KIND PERMITS, as the model reads it in the first turn, beside the
 * request. Written as instructions about this run, never as the label alone:
 * a model told "FULL_SITE_REDESIGN" without what follows from it treats it as
 * a tag and carries on preserving.
 */
export function intentGuidance(intent: Intent): string {
  const lines: string[] = ["HOW TO TREAT THIS REQUEST (internal, never say these words to the creator):"]
  switch (intent.kind) {
    case "NEW_SITE_GENERATION":
    case "FULL_SITE_REDESIGN":
      lines.push(
        intent.kind === "NEW_SITE_GENERATION"
          ? "This is a NEW SITE from a brief. What is on the page now is not a starting point."
          : "This is a NEW CREATIVE DIRECTION for the whole site. The current sections are NOT worth preserving by default. Recolouring them, rewording them or changing their spacing is the failure this run exists to avoid.",
        "Work as a senior designer starting a real brief: decide what a good real website for this business, audience and mood contains, then build that. Follow the CREATIVE PLAN below in its order.",
        "You may and should: remove weak or generic sections (remove_section when they no longer belong, set_section_visibility only for content the creator wrote that may come back), add new ones, reorder the page, change the colour schemes (set_color_scheme), the fonts and buttons (update_theme), the header's layout and the brand, and write sections of your own (create_section) for the moments that make this site recognisable.",
        "Keep only what the plan keeps: real facts about the business (names, prices, addresses, products from the store) and anything the creator clearly wrote themselves that still fits.",
        "Different industries produce different websites. Someone looking at the result without the prompt should know what kind of business this is.",
        "Before you finish ask yourself: if I had been hired to design this site from this brief, would I choose this structure and this design? If not, keep going.",
      )
      break
    case "PAGE_REDESIGN":
      lines.push(
        "This page is to be RETHOUGHT. Its current structure is not a constraint: decide what this page should contain for its purpose, then remove, replace, add and reorder sections to get there. Follow the CREATIVE PLAN below.",
        "Keep the theme settings and other pages as they are unless the plan says the page cannot work without a change to them. Keep the real facts and the creator's own words where they still fit.",
      )
      break
    case "SECTION_REDESIGN":
      lines.push(
        "ONE SECTION is to be rethought: the one selected, or the one the request names (find it on the page; the PROJECT STATE says what each section is). Read it first.",
        "Rethink its layout, hierarchy, content and settings, not only its colours. If a different section type or a section of your own (create_section) would do the job better, put that in its place at the same position and remove or hide the old one, carrying its real content over.",
        "Leave every other section exactly as it is.",
      )
      break
    case "FUNCTIONAL_CHANGE":
      lines.push(
        "This is about BEHAVIOUR: motion, interaction, a countdown, a slider, what happens on hover or scroll. It almost never lives in a setting: read the section's code and change its CSS and script, or write a section of your own that does it.",
        "Change only the section or sections it is about.",
      )
      break
    case "STYLE_CHANGE":
      lines.push(
        intent.scope === "site"
          ? "This is about HOW THE WHOLE SITE LOOKS. Theme settings, colour schemes and fonts are the place, then each section's colour scheme. Keep every section's content and order."
          : "This is about HOW SOMETHING LOOKS. Change its settings, its colour scheme or its CSS. Keep its content and everything else.",
      )
      break
    case "CONTENT_CHANGE":
      lines.push("This is about CONTENT: the words, pictures or entries. Change those in the settings and blocks where they live. Keep the design, the layout and every other section.")
      break
    case "QUESTION":
      lines.push("This is a QUESTION. Answer it in one to three plain sentences and change nothing, unless the question is plainly a request in disguise.")
      break
    default:
      lines.push("This is a LOCAL EDIT. Find the thing it is about (read it first), change that, and preserve everything unrelated exactly as it is.")
  }
  if (intent.wantsMotion && intent.kind !== "QUESTION") {
    lines.push(
      "MOTION AND INTERACTION ARE A REQUIREMENT HERE, not decoration: build them for real in CSS (and a small script only where CSS cannot), with the theme's own entrance animation on (update_theme animations_enabled) and sections of your own for what no setting does: scroll reveals, staggered entrances, a marquee, images that scale or move on scroll, hover states that respond, a counter, a countdown, sticky storytelling. Every one stops under prefers-reduced-motion and none of them gets in the way of reading.",
    )
  }
  if (intent.rebuild && (intent.kind === "SECTION_REDESIGN" || intent.kind === "FUNCTIONAL_CHANGE" || intent.kind === "STYLE_CHANGE" || intent.kind === "LOCAL_EDIT")) {
    lines.push(
      "MADE AGAIN, NOT ADJUSTED. They asked for this to be rebuilt, so moving the old section's settings, colours or spacing is the failure here. Write a NEW section of your own with create_section: new markup, a new layout, its own CSS and motion, and a full set of controls (content, layout, style) so they can change it later without code. Put it where the old one is, carry over the real content (a FAQ's actual questions and answers, the names in the testimonials, the links), then remove the old one. Keep what it is for: a FAQ stays a FAQ.",
    )
  } else if (intent.light && intent.kind !== "QUESTION") {
    lines.push("A LIGHT TOUCH was asked for. Keep the section, its structure and its content; move its look (settings, then CSS) only as far as the words ask.")
  }
  if (intent.newPage) {
    lines.push(
      "A NEW PAGE. It is not the open page: build it in one call with build_page (list_pages first to see what exists), every section filled with real content, then put it in the menu with edit_menu so visitors can reach it. Say its address in your reply.",
    )
  }
  if (intent.global) {
    lines.push(
      "A VALUE EVERY PAGE READS. The logo, the store name, the socials and the currency live in the theme and the store: change them once (update_theme, or the store's own setting), never by typing them into each section. A section that hard codes one is fixed to read theme.logo / shop.name / shop.socials instead.",
    )
  }
  if (intent.recreate) {
    lines.push(
      "MATCH THE PICTURE. They sent a picture to be built, not a mood board. Recreate its layout, proportions, type sizes and weights, spacing and colours as closely as Storelib allows, in sections of your own where no built-in one has that layout. When you are done the page is photographed at the picture's width and measured against it, and you are told where it differs: change the page until it is close. Their copy and photographs are theirs to supply: put editable placeholders where a photograph goes, and never claim it is identical.",
    )
  }
  if (intent.keep?.length) {
    lines.push(`LEAVE ALONE, as they said: ${intent.keep.map((k) => `"${k}"`).join(", ")}. Do not change, move, hide or remove it, even inside a redesign.`)
  }
  if (intent.followUp) lines.push("This message follows your last change. Resolve \"this\", \"that\" and \"the previous one\" against it and the PROJECT STATE.")
  return lines.join("\n")
}

/**
 * ===========================================================================
 *  SITE STORIES: DIFFERENT BUSINESSES, DIFFERENT SEQUENCES (round O, O5)
 * ===========================================================================
 * Spec 6.2. A fitness coach, a pilates studio, a sample pack store and a
 * design agency do not tell the same story, so their home pages are not
 * the same Hero, Features, Pricing, FAQ, CTA skeleton with new words. Each
 * story here is a sequence of beats (what the section does for the visitor)
 * mapped to a composition from ./grammar.ts, with the primary action and the
 * motion feel the business suggests.
 *
 * `layoutStoryFor(brief)` picks one deterministically from the brief's
 * words (category first, then the prompt) and an objective when one is
 * given. `planSkeletonIssue` is the planner's check (lib/ai-builder/agent/
 * site-plan.ts readSitePlan): a home plan that is the generic SaaS skeleton
 * for a business that is not software is refused, with this story as the
 * way forward.
 *
 * Pure.
 */
import { MOTION_TIER_PARAMS, motionTierFor, type MotionTier } from "../motion"
import { compositionById, CONVERSION_RULES, COPY_RULES, RESPONSIVE_RULES } from "./grammar"

export type Objective = "book" | "buy" | "enquire" | "join" | "listen"

export interface StoryBeat {
  /** What the section does for the visitor. */
  beat: string
  /** A composition id (./grammar.ts). */
  composition: string
}

export interface SiteStory {
  id: string
  name: string
  /** Words in a brief that mean this business. */
  match: RegExp
  /** The default primary action. */
  objective: Objective
  /** The action's honest wiring in Storelib. */
  action: string
  /** The motion feel it suggests unless the creator said otherwise. */
  motion: MotionTier
  /** Jobs a home page for this business can do (round 56: ingredients to choose from and order, not a fixed spine). */
  beats: StoryBeat[]
  /** What the plan must cover to be this story and not a generic skeleton: one pattern per essential beat. */
  essentials: { label: string; pattern: RegExp }[]
  /** The main asset and the trap to avoid. */
  note: string
  /** Other pages it needs. */
  pages: string[]
}

const b = (beat: string, composition: string): StoryBeat => ({ beat, composition })

export const SITE_STORIES: SiteStory[] = [
  {
    id: "fitness-coach",
    name: "Fitness coach or personal trainer",
    match: /\b(?:personal trainer|trainer|pt|fitness|strength|coach(?:ing)? (?:for )?(?:lifting|running|athletes)|gym|workout|hypertrophy|powerlifting|crossfit|bootcamp|run club|athlete)\b/i,
    objective: "book",
    action: "a consultation: the store's booking form (a form with booking) or a first-session product's checkout_url",
    motion: "balanced",
    beats: [
      b("who it is for and the first step, over real training photography", "full-bleed-photo-hero"),
      b("the coach: a real photo, a short real story, qualifications that exist", "split-editorial"),
      b("who the programme is for, and who it is not for", "manifesto"),
      b("the method: assessment, plan, sessions, check ins", "sticky-narrative"),
      b("a running band of real class times or the next intake date", "marquee-band"),
      b("the offers from the store, the recommended one larger", "unequal-offers"),
      b("a training day in photos", "visual-dossier"),
      b("one real client quote with consent, only if supplied", "photo-quote"),
      b("what to bring, level, injuries, cancellation", "compact-faq"),
      b("book the consultation, and what happens next", "booking-cta"),
    ],
    essentials: [
      { label: "the coach (a real person)", pattern: /\b(?:coach|trainer|about (?:me|the coach)|meet|who i am|my story|bio)\b/i },
      { label: "who it is for", pattern: /\bwho (?:it|this|the programme|the program)(?:'s| is) for\b|\bfor you if\b|\bnot for\b|\bclients? like\b/i },
      { label: "the method", pattern: /\b(?:method|approach|how (?:it|we|i) work|how the|process|programme|program|weeks?|sessions?)\b/i },
      { label: "booking a consultation", pattern: /\b(?:book|booking|consult(?:ation)?|first session|call|schedule|apply)\b/i },
    ],
    note: "Authentic training photography is the main asset: performance and sport energy, never a literary magazine. Proof only with permission.",
    pages: ["coaching or programmes (the offers in detail)", "about (the coach)", "contact or book"],
  },
  {
    id: "wellness-studio",
    name: "Pilates, yoga or wellness studio",
    match: /\b(?:pilates|yoga|reformer|wellness|meditation|breathwork|massage|spa|physio(?:therapy)?|holistic|retreat|mindful(?:ness)?)\b/i,
    objective: "book",
    action: "a class or first visit: the booking form, or the intro offer's checkout_url",
    motion: "quiet",
    beats: [
      b("the room and the feeling of a class, one calm photo", "full-bleed-photo-hero"),
      b("what a first visit is like, step by step", "process-steps"),
      b("the classes and programmes, by level", "index-list"),
      b("the teachers and their training", "split-editorial"),
      b("the space: light, equipment, where it is", "visual-dossier"),
      b("this week's timetable or the next course start", "marquee-band"),
      b("the intro offer and passes from the store", "unequal-offers"),
      b("accessibility, injuries, pregnancy, what to wear", "compact-faq"),
      b("a short note from the founder", "narrow-reading-column"),
      b("book a first class, and the address if given", "booking-cta"),
    ],
    essentials: [
      { label: "the classes", pattern: /\b(?:class(?:es)?|timetable|schedule|sessions?|courses?|levels?)\b/i },
      { label: "the teachers", pattern: /\b(?:teachers?|instructors?|founder|about|meet)\b/i },
      { label: "the space or location", pattern: /\b(?:studio|space|room|location|where|address|visit)\b/i },
      { label: "booking", pattern: /\b(?:book|booking|first (?:class|visit)|intro|trial|pass(?:es)?)\b/i },
    ],
    note: "Softer rhythm, restrained motion, accessible trust. Atmosphere comes from real photos of the room, not gradients.",
    pages: ["classes and timetable", "teachers", "pricing and passes", "visit or contact"],
  },
  {
    id: "sample-pack-store",
    name: "Music producer or sample pack store",
    match: /\b(?:sample packs?|samples?|loops?|drum kits?|presets?|beats?|producer|beatmaker|stems|sound design|midi|plugins?|vst|music production|record label)\b/i,
    objective: "buy",
    action: "buy: add to cart (data-storelib-add-to-cart with the product id) or the pack's checkout_url",
    motion: "expressive",
    beats: [
      b("the newest pack as the opening: cover, name, price, a play control", "product-editorial"),
      b("listen: previews of the real audio", "product-led-demo"),
      b("the catalogue as an index of packs with format, BPM and key", "index-list"),
      b("a running band of releases or what is new", "marquee-band"),
      b("how it was recorded: gear, rooms, the process", "visual-dossier"),
      b("the producer: who makes these and why", "split-editorial"),
      b("what you get: files, formats, sizes, licence", "comparison-table"),
      b("one featured pack told in depth", "case-study"),
      b("licence, refunds, downloads", "compact-faq"),
      b("sign up for new releases", "booking-cta"),
    ],
    essentials: [
      { label: "the packs from the store", pattern: /\b(?:packs?|catalogue|catalog|releases?|products?|kits?|shop|store)\b/i },
      { label: "listening to the sound", pattern: /\b(?:listen|previews?|demo|audio|player|play|hear)\b/i },
      { label: "what is in a pack (files, formats, licence)", pattern: /\b(?:formats?|files?|wav|bpm|key|licen[cs]e|royalty|contents|what you get|specs?)\b/i },
    ],
    note: "The sound is the product: previews and real specs come before any story. Digital checkout is Storelib's own; no fake download counts.",
    pages: ["shop (every pack)", "the product template", "licence", "about"],
  },
  {
    id: "agency",
    name: "Design, brand or creative agency",
    match: /\b(?:agency|design studio|creative studio|branding|brand(?:ing)? design(?:er)?|brand identity|brand studio|graphic design(?:er)?|web design(?:er)?|digital studio|consultancy studio|art direct(?:ion|or))\b/i,
    objective: "enquire",
    action: "an enquiry: the contact form, or a mailto link the creator gave",
    motion: "expressive",
    beats: [
      b("a statement of what the studio does and for whom", "type-led-hero"),
      b("selected work as an index with hover previews", "index-list"),
      b("one project told big, with the brief and what changed", "case-study"),
      b("the work, in a mosaic of real images", "unequal-mosaic"),
      b("what the studio believes about the work", "manifesto"),
      b("services with what each includes", "anchored-detail"),
      b("how a project runs, week by week", "process-steps"),
      b("real clients or press, if any", "credentials"),
      b("the people", "split-editorial"),
      b("start a project: the form and what happens next", "booking-cta"),
    ],
    essentials: [
      { label: "the work first", pattern: /\b(?:work|projects?|case stud(?:y|ies)|portfolio|selected)\b/i },
      { label: "a point of view", pattern: /\b(?:manifesto|philosophy|believe|approach|point of view|studio)\b/i },
      { label: "an enquiry", pattern: /\b(?:enquir(?:y|e)|inquir(?:y|e)|contact|start a project|brief|talk|email)\b/i },
    ],
    note: "Projects first; images deserve large surfaces. No invented client logos or results.",
    pages: ["work (index)", "a case study page per project", "studio", "contact"],
  },
  {
    id: "architect",
    name: "Architecture or interior studio",
    match: /\b(?:architect(?:ure|s)?|interior design(?:er)?|interiors|landscape design|building design)\b/i,
    objective: "enquire",
    action: "an enquiry form or the studio's email",
    motion: "balanced",
    beats: [
      b("one built project, edge to edge", "full-bleed-photo-hero"),
      b("the projects as an index by type and year", "index-list"),
      b("a project told through plans and photos", "case-study"),
      b("details and materials", "visual-dossier"),
      b("the studio's philosophy", "narrow-reading-column"),
      b("services and stages of work", "process-steps"),
      b("awards or publications that exist", "credentials"),
      b("the team", "split-editorial"),
      b("current and upcoming work", "unequal-mosaic"),
      b("enquire about a project", "booking-cta"),
    ],
    essentials: [
      { label: "projects first", pattern: /\b(?:projects?|work|built|case stud(?:y|ies))\b/i },
      { label: "the studio's philosophy", pattern: /\b(?:philosophy|studio|approach|practice)\b/i },
      { label: "an enquiry", pattern: /\b(?:enquir|inquir|contact|commission)\w*/i },
    ],
    note: "Large image surfaces, quiet type, real plans and drawings.",
    pages: ["projects", "a page per project", "studio", "contact"],
  },
  {
    id: "photographer",
    name: "Photographer or videographer",
    match: /\b(?:photograph(?:er|y)|videograph(?:er|y)|filmmaker|cinematograph(?:er|y)|wedding (?:photo|film)|portraits?|director of photography)\b/i,
    objective: "book",
    action: "a date enquiry or booking form",
    motion: "expressive",
    beats: [
      b("the reel or the strongest frame", "media-reel"),
      b("selected stories, an index with previews", "index-list"),
      b("one story told in full", "case-study"),
      b("a mosaic of frames at their own ratios", "unequal-mosaic"),
      b("how they work on the day", "sticky-narrative"),
      b("the collections or packages", "unequal-offers"),
      b("about the photographer, a self portrait", "split-editorial"),
      b("one real couple's or client's words", "photo-quote"),
      b("dates, travel, delivery", "compact-faq"),
      b("check a date", "booking-cta"),
    ],
    essentials: [
      { label: "the work or reel", pattern: /\b(?:work|reel|portfolio|stories|gallery|films?|frames?)\b/i },
      { label: "booking a date", pattern: /\b(?:book|date|availability|enquir|inquir|contact)\w*/i },
    ],
    note: "The work is the hero, shown at its own ratio and never cropped to fit a card.",
    pages: ["work", "packages", "about", "contact"],
  },
  {
    id: "digital-creator",
    name: "Digital creator or educator",
    match: /\b(?:creator|youtuber|influencer|newsletter|course|online course|cohort|templates?|ebook|guide|community|membership|notion|digital products?|educator|teacher|tutor)\b/i,
    objective: "buy",
    action: "the product's checkout_url, the community's join link, or the subscribe form",
    motion: "balanced",
    beats: [
      b("the creator and the one thing they help with", "split-editorial"),
      b("the flagship product from the store, told in depth", "product-editorial"),
      b("what is inside: modules, templates, pages", "product-led-demo"),
      b("all products as an index", "index-list"),
      b("the community or membership, if there is one", "full-bleed-photo-hero"),
      b("free content to start with", "narrow-reading-column"),
      b("a running band of what is new", "marquee-band"),
      b("real reviews from the store, if any", "photo-quote"),
      b("refunds, access, updates", "compact-faq"),
      b("join the list or buy", "booking-cta"),
    ],
    essentials: [
      { label: "the creator's personality", pattern: /\b(?:about|creator|me|story|who)\b/i },
      { label: "real products or the community", pattern: /\b(?:products?|course|templates?|community|membership|shop|store)\b/i },
    ],
    note: "A strong route into actual products with Storelib checkout.",
    pages: ["shop", "the product template", "about", "community"],
  },
  {
    id: "saas",
    name: "Software product",
    match: /\b(?:saas|software|app|platform|api|dashboard|tool for teams|b2b|startup|developer tool)\b/i,
    objective: "join",
    action: "sign up or start a trial on a real page, or a demo request form",
    motion: "balanced",
    beats: [
      b("the problem and the product in one line, with a true screenshot", "split-editorial"),
      b("the product working: real screenshots with controls", "product-led-demo"),
      b("the workflow, step by step", "sticky-narrative"),
      b("honest differences from the alternatives", "comparison-table"),
      b("features as an index, not a grid of icons", "index-list"),
      b("who uses it, only if real", "credentials"),
      b("pricing from real plans", "unequal-offers"),
      b("questions about data, billing, migration", "compact-faq"),
      b("a note from the founder", "narrow-reading-column"),
      b("start", "booking-cta"),
    ],
    essentials: [
      { label: "the product shown working", pattern: /\b(?:screenshot|product|demo|app|workflow)\b/i },
    ],
    note: "A true product screenshot, never a fake app UI.",
    pages: ["pricing", "product or features", "about", "contact"],
  },
  {
    id: "local-professional",
    name: "Local professional or trade",
    match: /\b(?:accountant|lawyer|solicitor|dentist|clinic|plumber|electrician|builder|cleaner|cleaning|locksmith|mechanic|garage|salon|barber|hairdresser|tutor(?:ing)?|therap(?:ist|y)|counsell?or|vet|estate agent|consult(?:ant|ants|ancy|ing)|advisory|advis[eo]rs?|(?:business|executive|leadership|career|life) coach(?:es|ing)?|professional services)\b/i,
    objective: "enquire",
    action: "call or the contact form; the address and hours only if given",
    motion: "quiet",
    beats: [
      b("what they do, where, and how to reach them, in the first screen", "split-editorial"),
      b("services with what each costs or includes", "anchored-detail"),
      b("how an appointment or job goes", "process-steps"),
      b("qualifications and memberships that exist", "credentials"),
      b("the person or team", "split-editorial"),
      b("areas served or the premises", "visual-dossier"),
      b("real reviews from the store, if any", "photo-quote"),
      b("prices, timing, cancellations", "compact-faq"),
      b("a short note on how they work", "narrow-reading-column"),
      b("contact: phone, form, hours", "booking-cta"),
    ],
    essentials: [
      { label: "the services", pattern: /\b(?:services?|what (?:we|i) do|treatments?|work)\b/i },
      { label: "contact details", pattern: /\b(?:contact|call|phone|book|appointment|visit|hours|address|enquir)\w*/i },
    ],
    note: "Clarity, trust, contact and service details above fancy interactions.",
    pages: ["services", "about", "contact"],
  },
  {
    id: "artist",
    name: "Artist or maker",
    match: /\b(?:artist|painter|illustrator|sculptor|ceramic(?:s|ist)?|potter|maker|printmaker|prints|textile|jewell?er|woodwork(?:er)?|craft)\b/i,
    objective: "buy",
    action: "the store's works (add to cart or checkout_url), or an enquiry for commissions",
    motion: "balanced",
    beats: [
      b("one work, large, with its title", "full-bleed-photo-hero"),
      b("the works for sale from the store", "index-list"),
      b("a series told in depth", "case-study"),
      b("the studio and process", "sticky-narrative"),
      b("the artist's own words", "narrow-reading-column"),
      b("works in a mosaic at their own ratios", "unequal-mosaic"),
      b("exhibitions and stockists that exist", "credentials"),
      b("commissions: how they work", "process-steps"),
      b("shipping, framing, care", "compact-faq"),
      b("buy or enquire", "booking-cta"),
    ],
    essentials: [
      { label: "the work", pattern: /\b(?:works?|pieces?|series|collection|shop|prints?|paintings?)\b/i },
      { label: "the artist's voice", pattern: /\b(?:artist|statement|about|studio|process|words)\b/i },
    ],
    note: "Work focus and personal voice; motion and type can express the practice.",
    pages: ["works or shop", "about", "commissions", "contact"],
  },
  {
    id: "food-place",
    name: "Restaurant, cafe or bakery",
    match: /\b(?:restaurant|cafe|café|bakery|bistro|bar|coffee|kitchen|deli|pizzeria|wine bar|food truck|supper club)\b/i,
    objective: "book",
    action: "a table booking form, the order link the creator gave, or the store's products",
    motion: "balanced",
    beats: [
      b("the room or the food, one real photo", "full-bleed-photo-hero"),
      b("today's menu or bakes as a running band", "marquee-band"),
      b("the menu, set like a menu", "index-list"),
      b("how it is made, in photos", "visual-dossier"),
      b("the people behind it", "split-editorial"),
      b("opening hours and where", "anchored-detail"),
      b("private dining or events", "unequal-offers"),
      b("a short story of the place", "narrow-reading-column"),
      b("allergens, groups, bookings", "compact-faq"),
      b("book a table or order", "booking-cta"),
    ],
    essentials: [
      { label: "the menu", pattern: /\b(?:menu|food|dishes|bakes?|drinks)\b/i },
      { label: "hours and location", pattern: /\b(?:hours|open|where|location|address|visit|find us)\b/i },
    ],
    note: "Real food and room photography; hours and address only if supplied.",
    pages: ["menu", "visit", "about"],
  },
  {
    id: "product-brand",
    name: "Product brand or shop",
    match: /\b(?:shop|store|brand|clothing|apparel|fashion|skincare|cosmetics|candles?|homeware|furniture|accessories|e-?commerce|products?)\b/i,
    objective: "buy",
    action: "add to cart with real product ids, collections from the store",
    motion: "balanced",
    beats: [
      b("the product or collection in use, edge to edge", "full-bleed-photo-hero"),
      b("the bestsellers from the store", "index-list"),
      b("one product told in depth with the real buy button", "product-editorial"),
      b("the collections", "unequal-mosaic"),
      b("how it is made", "sticky-narrative"),
      b("a running band of what is new or delivery news", "marquee-band"),
      b("the brand's point of view", "manifesto"),
      b("real reviews from the store, if any", "photo-quote"),
      b("delivery, returns, care", "compact-faq"),
      b("sign up for drops", "booking-cta"),
    ],
    essentials: [
      { label: "real products from the store", pattern: /\b(?:products?|bestsellers?|collections?|shop|new in|range)\b/i },
    ],
    note: "Products from the store only; no invented items or prices.",
    pages: ["shop", "collections", "the product template", "about"],
  },
]

export const DEFAULT_STORY = "digital-creator"

export function storyById(id: string): SiteStory | undefined {
  return SITE_STORIES.find((s) => s.id === id)
}

/** What a brief can say. Matches O2's CreativeBrief loosely: any of these fields. */
export interface StoryBrief {
  prompt?: string
  category?: string | null
  businessType?: string | null
  objective?: string | null
  primaryAction?: string | null
}

const OBJECTIVES: Record<string, Objective> = { book: "book", booking: "book", buy: "buy", sell: "buy", purchase: "buy", shop: "buy", enquire: "enquire", inquire: "enquire", contact: "enquire", lead: "enquire", join: "join", signup: "join", subscribe: "join", listen: "listen" }

function objectiveOf(text: string | null | undefined): Objective | null {
  if (!text) return null
  const w = text.toLowerCase().match(/[a-z]+/g) ?? []
  for (const x of w) if (OBJECTIVES[x]) return OBJECTIVES[x]
  return null
}

/** How many times a story's words occur in a text, and where the first is. */
function hits(story: SiteStory, text: string): { n: number; first: number } {
  const all = [...text.matchAll(new RegExp(story.match.source, "gi"))]
  /* The general shop words (shop, brand, products) count half: a trade named beside them is the business. */
  return { n: story.id === "product-brand" ? all.length / 2 : all.length, first: all[0]?.index ?? Infinity }
}

/**
 * The story a brief is, deterministically: the category (the creator's own
 * pick on the start screen) or business type first, then the prompt. Within
 * one text the story whose words occur most wins; a tie goes to the one
 * named first ("a pilates studio for core strength" is a studio, not a gym),
 * then to the earlier story, the specific trades before the general shop.
 */
export function classifyStory(brief: StoryBrief): SiteStory {
  const sources = [brief.businessType, brief.category?.replace(/_/g, " "), brief.prompt].filter((s): s is string => typeof s === "string" && s.trim() !== "")
  for (const text of sources) {
    let best: SiteStory | null = null
    let most = { n: 0, first: Infinity }
    for (const s of SITE_STORIES) {
      const h = hits(s, text)
      if (h.n > most.n || (h.n === most.n && h.n > 0 && h.first < most.first)) {
        best = s
        most = h
      }
    }
    if (best) return best
  }
  return storyById(DEFAULT_STORY)!
}

export interface LayoutStory {
  story: SiteStory
  objective: Objective
  motion: MotionTier
  /** The block for a prompt. */
  text: string
}

/** The story for a brief, with its objective and motion feel, and the prompt block. `motion` (round 56): the job's one motion level, when another part of the brief already chose it. */
export function layoutStoryFor(brief: StoryBrief, opts: { motion?: MotionTier } = {}): LayoutStory {
  const story = classifyStory(brief)
  const objective = objectiveOf(brief.objective) ?? objectiveOf(brief.primaryAction) ?? story.objective
  const words = [brief.prompt, brief.businessType].filter(Boolean).join(" ")
  const asked = motionTierFor(words)
  /* The creator's own words about motion win; otherwise the trade's feel. */
  const motion = opts.motion ?? (/\b(?:motion|animat|movement|scroll|static|immersive|cinematic)\w*/i.test(words) ? asked : story.motion)
  const lines = story.beats.map((x) => `- ${x.beat} [${x.composition}${compositionById(x.composition)?.examples[0] ? `, e.g. ${compositionById(x.composition)!.examples[0]}` : ""}]`)
  const text = `SITE STORY (${story.name}): jobs a home page for this business can do. Choose the ones this site needs, order them for this visitor, and add one only this business would have; this is a pantry, not a recipe.
${lines.join("\n")}
- Primary action: ${objective}. Wire it to ${story.action}. It has a home in the first screen and at the end.
- ${story.note}
- Other pages: ${story.pages.join("; ")}.
- The plan covers: ${story.essentials.map((e) => e.label).join(", ")}. Hero, Features, Pricing, FAQ, CTA is a software landing page and is refused for a business that is not software.
- Motion feel ${motion}: ${MOTION_TIER_PARAMS[motion].describe}.
LAYOUT RULES
${[...CONVERSION_RULES, ...RESPONSIVE_RULES, ...COPY_RULES].map((r) => `- ${r}`).join("\n")}`
  return { story, objective, motion, text }
}

/* ── the planner's check: the generic skeleton ────────────────────────── */

const ROLE_PATTERNS: { role: string; pattern: RegExp }[] = [
  { role: "hero", pattern: /\bhero\b|\bopening\b|\bintro\b|\bbanner\b|above the fold/i },
  { role: "features", pattern: /\bfeatures?\b|\bbenefits?\b|why (?:choose|us)|what you get|\bservices? grid\b|three (?:cards|columns)|\bicon/i },
  { role: "pricing", pattern: /\bpricing\b|\bprices?\b|\bplans?\b|\bpackages?\b|\btiers?\b/i },
  { role: "faq", pattern: /\bfaqs?\b|\bquestions\b/i },
  { role: "cta", pattern: /\bcta\b|call to action|get started|\bclosing\b|\bfinal\b|sign ?up (?:band|banner|strip)/i },
  { role: "testimonials", pattern: /\btestimonials?\b|\breviews?\b|social proof|\bquotes?\b/i },
  { role: "logos", pattern: /\blogos?\b|trusted by|as seen/i },
  { role: "stats", pattern: /\bstats?\b|\bmetrics\b|\bnumbers\b|\bcounters?\b/i },
]
const SKELETON = ["hero", "features", "pricing", "faq", "cta"]

/** A plan line's generic role, if it has one. */
export function sectionRole(line: string): string | null {
  const text = line.replace(/\bai_/g, " ").replace(/_/g, " ")
  return ROLE_PATTERNS.find((r) => r.pattern.test(text))?.role ?? null
}

/** How many of Hero, Features, Pricing, FAQ, CTA the lines hold in that order. */
export function skeletonMatch(lines: string[]): number {
  const roles = lines.map(sectionRole)
  let at = 0
  let n = 0
  for (const want of SKELETON) {
    const i = roles.indexOf(want, at)
    if (i < 0) continue
    n++
    at = i + 1
  }
  return n
}

/**
 * The planner's check. Null when the home plan is fine; otherwise the reason
 * and the story to follow. A home plan is the generic skeleton when it holds
 * at least four of Hero, Features, Pricing, FAQ, CTA in that order and covers
 * fewer than half the story's essentials. A software business is allowed it.
 */
export function planSkeletonIssue(homeLines: string[], brief: StoryBrief): string | null {
  const { story } = layoutStoryFor(brief)
  if (story.id === "saas") return null
  if (skeletonMatch(homeLines) < 4) return null
  const text = homeLines.join("\n")
  const covered = story.essentials.filter((e) => e.pattern.test(text))
  if (covered.length >= Math.ceil(story.essentials.length / 2)) return null
  const missing = story.essentials.filter((e) => !covered.includes(e)).map((e) => e.label)
  return `home: this plan is the generic Hero, Features, Pricing, FAQ, CTA skeleton of a software landing page, and this is a ${story.name.toLowerCase()} site. Tell its story instead: ${story.beats.map((x) => x.beat).join("; ")}. It must cover ${missing.join(", ")}.`
}
